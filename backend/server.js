const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { v4: uuidv4 } = require('uuid');
const agent = require('./agent');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '../frontend/build')));

// --- API Routes ---

// Get all categories
app.get('/api/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories').all();
  res.json(categories);
});

// Get all restaurants (with optional filters)
app.get('/api/restaurants', (req, res) => {
  const { cuisine, search, featured } = req.query;
  let query = 'SELECT * FROM restaurants WHERE 1=1';
  const params = [];

  if (cuisine) {
    query += ' AND cuisine = ?';
    params.push(cuisine);
  }
  if (search) {
    query += ' AND (name LIKE ? OR cuisine LIKE ? OR description LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (featured === 'true') {
    query += ' AND featured = 1';
  }

  query += ' ORDER BY rating DESC';
  const restaurants = db.prepare(query).all(...params);
  res.json(restaurants);
});

// Get single restaurant with menu
app.get('/api/restaurants/:id', (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const menuItems = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY popular DESC, name ASC').all(req.params.id);

  // Group menu items by category
  const menuByCategory = {};
  for (const item of menuItems) {
    const cat = item.category || 'Other';
    if (!menuByCategory[cat]) menuByCategory[cat] = [];
    menuByCategory[cat].push(item);
  }

  res.json({ ...restaurant, menu: menuByCategory, menuItems });
});

// Search menu items across all restaurants
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const term = `%${q}%`;
  const items = db.prepare(`
    SELECT mi.*, r.name as restaurant_name, r.delivery_time, r.delivery_fee
    FROM menu_items mi
    JOIN restaurants r ON mi.restaurant_id = r.id
    WHERE mi.name LIKE ? OR mi.description LIKE ? OR mi.category LIKE ?
    LIMIT 20
  `).all(term, term, term);

  res.json(items);
});

// Generate a short, human-friendly pickup code (e.g. "A7K4")
function generatePickupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create an order (delivery OR walk-up pickup)
app.post('/api/orders', (req, res) => {
  const {
    restaurant_id,
    items,
    delivery_address,
    order_type,
    customer_name,
    customer_phone,
  } = req.body;

  if (!restaurant_id || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const type = order_type === 'pickup' ? 'pickup' : 'delivery';

  if (type === 'pickup' && !customer_phone) {
    return res.status(400).json({ error: 'Phone number is required for walk-up pickup' });
  }

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurant_id);
  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  // Walk-up pickup = no delivery fee (that's the whole point!)
  const delivery_fee = type === 'pickup' ? 0 : restaurant.delivery_fee;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + delivery_fee + tax) * 100) / 100;

  const orderId = uuidv4();
  const pickupCode = type === 'pickup' ? generatePickupCode() : null;
  const initialStatus = type === 'pickup' ? 'preparing' : 'confirmed';

  db.prepare(`
    INSERT INTO orders (
      id, restaurant_id, items, subtotal, delivery_fee, tax, total,
      delivery_address, order_type, pickup_code, customer_name, customer_phone, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId, restaurant_id, JSON.stringify(items), subtotal, delivery_fee, tax, total,
    delivery_address || '', type, pickupCode, customer_name || '', customer_phone || '',
    initialStatus,
  );

  res.status(201).json({
    id: orderId,
    restaurant_id,
    restaurant_name: restaurant.name,
    items,
    subtotal,
    delivery_fee,
    tax,
    total,
    status: initialStatus,
    order_type: type,
    pickup_code: pickupCode,
    customer_name: customer_name || '',
    customer_phone: customer_phone || '',
    estimated_delivery: restaurant.delivery_time,
  });
});

// Update order status (e.g. staff marking as ready / picked up)
app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['preparing', 'ready', 'picked_up', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const now = new Date().toISOString();
  const readyAt = status === 'ready' ? now : order.ready_at;
  const pickedUpAt = status === 'picked_up' ? now : order.picked_up_at;

  db.prepare(`
    UPDATE orders SET status = ?, ready_at = ?, picked_up_at = ? WHERE id = ?
  `).run(status, readyAt, pickedUpAt, req.params.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  updated.items = JSON.parse(updated.items);
  res.json(updated);
});

// Get all pickup orders (for staff / kitchen view)
app.get('/api/pickup-orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, r.name as restaurant_name
    FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id
    WHERE o.order_type = 'pickup' AND o.status != 'picked_up' AND o.status != 'cancelled'
    ORDER BY o.created_at ASC
  `).all();
  orders.forEach(o => { o.items = JSON.parse(o.items); });
  res.json(orders);
});

// Get order by ID
app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, r.name as restaurant_name, r.image as restaurant_image
    FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  order.items = JSON.parse(order.items);
  res.json(order);
});

// Get all orders
app.get('/api/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, r.name as restaurant_name, r.image as restaurant_image
    FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id
    ORDER BY o.created_at DESC
  `).all();

  orders.forEach(o => { o.items = JSON.parse(o.items); });
  res.json(orders);
});

// --- AI Drive-through voice agent ----------------------------------------

// Start a new voice ordering session
app.post('/api/agent/session', (req, res) => {
  const sessionId = uuidv4();
  const session = agent.getSession(sessionId);
  const { reply } = agent.handleTurn(session, '');
  res.json({ sessionId, reply, state: publicState(session) });
});

// Send a user utterance; get the agent's reply back
app.post('/api/agent/message', (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !agent.sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Unknown session. Start a new one.' });
  }
  const session = agent.getSession(sessionId);
  const result = agent.handleTurn(session, message || '');

  // Special sentinel: agent wants to actually place the order now.
  if (result.reply === '__PLACE_ORDER__') {
    const { subtotal, tax, total } = agent.summarize(session);
    const orderId = uuidv4();
    const pickupCode = generatePickupCode();
    db.prepare(`
      INSERT INTO orders (
        id, restaurant_id, items, subtotal, delivery_fee, tax, total,
        delivery_address, order_type, pickup_code, customer_name, customer_phone, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pickup', ?, ?, ?, 'preparing')
    `).run(
      orderId, session.restaurant.id, JSON.stringify(session.items),
      subtotal, 0, tax, total, '', pickupCode,
      session.name, session.phone,
    );
    session.stage = 'placed';
    session.orderId = orderId;
    session.pickupCode = pickupCode;

    return res.json({
      reply:
        `You're all set! Your pickup code is ${pickupCode.split('').join(' ')}. ` +
        `We'll text ${session.phone} when your food is ready. See you soon!`,
      state: publicState(session),
      orderId,
      pickupCode,
    });
  }

  res.json({ reply: result.reply, state: publicState(session) });
});

function publicState(s) {
  return {
    stage: s.stage,
    restaurant: s.restaurant ? { id: s.restaurant.id, name: s.restaurant.name } : null,
    items: s.items,
    name: s.name,
    phone: s.phone,
    orderId: s.orderId,
    pickupCode: s.pickupCode,
  };
}

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
