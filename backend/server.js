const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { v4: uuidv4 } = require('uuid');

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

// Create an order
app.post('/api/orders', (req, res) => {
  const { restaurant_id, items, delivery_address } = req.body;

  if (!restaurant_id || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurant_id);
  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const delivery_fee = restaurant.delivery_fee;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + delivery_fee + tax) * 100) / 100;

  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, restaurant_id, items, subtotal, delivery_fee, tax, total, delivery_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, restaurant_id, JSON.stringify(items), subtotal, delivery_fee, tax, total, delivery_address || '');

  res.status(201).json({
    id: orderId,
    restaurant_id,
    restaurant_name: restaurant.name,
    items,
    subtotal,
    delivery_fee,
    tax,
    total,
    status: 'confirmed',
    estimated_delivery: restaurant.delivery_time,
  });
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

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
