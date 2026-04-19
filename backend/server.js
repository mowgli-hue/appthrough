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

// Get order by ID (includes queue position + ETA for pickup orders)
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

  if (order.order_type === 'pickup' && order.status === 'preparing') {
    const ahead = db.prepare(`
      SELECT COUNT(*) as cnt FROM orders
      WHERE order_type = 'pickup'
        AND status = 'preparing'
        AND restaurant_id = ?
        AND created_at < ?
    `).get(order.restaurant_id, order.created_at);
    order.queue_position = (ahead?.cnt || 0) + 1;
    order.estimated_minutes = order.queue_position * 4;
  } else if (order.order_type === 'pickup' && order.status === 'ready') {
    order.queue_position = 0;
    order.estimated_minutes = 0;
  }

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

// Start a new voice ordering session (optionally scoped to a restaurant for kiosk mode)
app.post('/api/agent/session', (req, res) => {
  const { restaurantId } = req.body || {};
  const sessionId = uuidv4();
  const opts = restaurantId ? { restaurantId } : {};
  const session = agent.getSession(sessionId, opts);
  const { reply } = agent.handleTurn(session, '');
  res.json({ sessionId, reply, state: publicState(session), kioskMode: session.kioskMode });
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

  res.json({ reply: result.reply, state: publicState(session), upsell: result.upsell || null });
});

function publicState(s) {
  return {
    stage: s.stage,
    restaurant: s.restaurant ? { id: s.restaurant.id, name: s.restaurant.name, image: s.restaurant.image } : null,
    items: s.items,
    name: s.name,
    phone: s.phone,
    orderId: s.orderId,
    pickupCode: s.pickupCode,
    kioskMode: s.kioskMode,
  };
}

// Get restaurant info for kiosk display
app.get('/api/restaurants/:id/kiosk', (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });
  const menuItems = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY popular DESC, name ASC').all(req.params.id);
  const popular = menuItems.filter(m => m.popular);
  res.json({ restaurant: r, menuItems, popular });
});

// Update restaurant drive-thru config (admin onboarding)
app.patch('/api/restaurants/:id/config', (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });

  const { greeting, supported_languages, default_language, agent_voice, pickup_instructions, drive_thru_enabled } = req.body;
  const fields = [];
  const values = [];

  if (greeting !== undefined) { fields.push('greeting = ?'); values.push(greeting); }
  if (supported_languages !== undefined) { fields.push('supported_languages = ?'); values.push(supported_languages); }
  if (default_language !== undefined) { fields.push('default_language = ?'); values.push(default_language); }
  if (agent_voice !== undefined) { fields.push('agent_voice = ?'); values.push(agent_voice); }
  if (pickup_instructions !== undefined) { fields.push('pickup_instructions = ?'); values.push(pickup_instructions); }
  if (drive_thru_enabled !== undefined) { fields.push('drive_thru_enabled = ?'); values.push(drive_thru_enabled ? 1 : 0); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE restaurants SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// --- Merchant registration (like Uber Eats / DoorDash merchant signup) ----

// Register a new restaurant + menu
app.post('/api/merchants/register', (req, res) => {
  const {
    name, cuisine, description, address, image,
    delivery_time, delivery_fee, min_order,
    greeting, pickup_instructions, menuItems,
  } = req.body;

  if (!name || !cuisine) {
    return res.status(400).json({ error: 'Restaurant name and cuisine are required' });
  }

  const restaurantId = uuidv4();
  db.prepare(`
    INSERT INTO restaurants (
      id, name, image, cuisine, rating, delivery_time, delivery_fee,
      min_order, address, description, featured, greeting, pickup_instructions,
      drive_thru_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)
  `).run(
    restaurantId,
    name,
    image || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    cuisine,
    4.5,
    delivery_time || '15-25 min',
    delivery_fee ?? 2.99,
    min_order ?? 10,
    address || '',
    description || '',
    greeting || '',
    pickup_instructions || '',
  );

  // Add menu items (skip items with no name or invalid price)
  if (menuItems && menuItems.length) {
    const stmt = db.prepare(`
      INSERT INTO menu_items (id, restaurant_id, name, description, price, image, category, popular)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of menuItems) {
      const price = parseFloat(item.price);
      if (!item.name || !item.name.trim() || !price || price <= 0) continue;
      stmt.run(
        uuidv4(),
        restaurantId,
        item.name.trim(),
        item.description || '',
        price,
        item.image || '',
        item.category || 'Main',
        item.popular ? 1 : 0,
      );
    }
  }

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);

  res.status(201).json({
    restaurant,
    menuItems: items,
    links: {
      kiosk: `/kiosk/${restaurantId}`,
      admin: `/admin/${restaurantId}`,
      kitchen: '/kitchen',
    },
  });
});

// Update menu items for a restaurant
app.put('/api/restaurants/:id/menu', (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });

  const { menuItems } = req.body;
  if (!menuItems) return res.status(400).json({ error: 'menuItems required' });

  // Remove old items and replace
  db.prepare('DELETE FROM menu_items WHERE restaurant_id = ?').run(req.params.id);
  const stmt = db.prepare(`
    INSERT INTO menu_items (id, restaurant_id, name, description, price, image, category, popular)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of menuItems) {
    stmt.run(
      item.id || uuidv4(),
      req.params.id,
      item.name,
      item.description || '',
      item.price || 0,
      item.image || '',
      item.category || 'Main',
      item.popular ? 1 : 0,
    );
  }

  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(req.params.id);
  res.json(items);
});

// Get merchant dashboard stats
app.get('/api/merchants/:id/stats', (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });

  const totalOrders = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE restaurant_id = ?').get(req.params.id).cnt;
  const pickupOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE restaurant_id = ? AND order_type = 'pickup'").get(req.params.id).cnt;
  const revenue = db.prepare('SELECT COALESCE(SUM(total), 0) as rev FROM orders WHERE restaurant_id = ?').get(req.params.id).rev;
  const activeOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE restaurant_id = ? AND status IN ('preparing', 'ready', 'confirmed')").get(req.params.id).cnt;
  const menuCount = db.prepare('SELECT COUNT(*) as cnt FROM menu_items WHERE restaurant_id = ?').get(req.params.id).cnt;

  res.json({
    restaurant: r,
    stats: { totalOrders, pickupOrders, revenue: Math.round(revenue * 100) / 100, activeOrders, menuCount },
  });
});

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
