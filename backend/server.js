const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { v4: uuidv4 } = require('uuid');
const agent = require('./agent');
const sms = require('./sms');
const email = require('./email');
const clover = require('./clover');
const payments = require('./payments');
const auth = require('./auth');
const rateLimit = require('express-rate-limit');
const menuImport = require('./menu-import');
const voice = require('./voice');
const llmAgent = require('./llm-agent');

const app = express();
const PORT = process.env.PORT || 3001;
// Flat App-Thru platform fee added to every order (dollars)
const APPTHRU_FEE = Math.max(0, parseFloat(process.env.APPTHRU_FEE ?? '0.99') || 0);
// Sales tax rate (BC food = 5% GST). Override with TAX_RATE env.
const TAX_RATE = Math.max(0, parseFloat(process.env.TAX_RATE ?? '0.05') || 0);
// App-Thru fee on staff-entered call-in orders (both tap-at-pickup and pay link)
const PHONE_ORDER_FEE = Math.max(0, parseFloat(process.env.PHONE_ORDER_FEE ?? '0.49') || 0);

// Sanitize size/portion options: [{name, price}] (max 8), or null
function cleanOptions(raw) {
  if (!Array.isArray(raw)) return null;
  const opts = raw
    .filter(o => o && o.name && Number.isFinite(parseFloat(o.price)))
    .slice(0, 8)
    .map(o => ({ name: String(o.name).trim().slice(0, 30), price: Math.round(parseFloat(o.price) * 100) / 100 }));
  return opts.length >= 2 ? JSON.stringify(opts) : null;
}

app.use(cors());
app.use(express.json());

// Behind a reverse proxy (Docker/hosted), trust the first hop for client IPs
app.set('trust proxy', 1);

// --- Rate limiting ----------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this device, please try again later' },
});
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import attempts, please try again later' },
});
app.use('/api/', apiLimiter);

// Ensure the authenticated merchant owns the restaurant in :id
function requireRestaurantOwnership(req, res, next) {
  if (!req.merchant || req.merchant.restaurantId !== req.params.id) {
    return res.status(403).json({ error: 'You do not have access to this restaurant' });
  }
  next();
}

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '../frontend/build')));

// --- Auth routes -----------------------------------------------------------

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { email, password, restaurantId } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  // SECURITY: adding a login to an EXISTING restaurant is only allowed for
  // someone already signed in as that restaurant (invite model). Without
  // this, anyone could bind an account to any restaurant id and take it over.
  if (restaurantId) {
    const header = req.headers.authorization || '';
    const decoded = header.startsWith('Bearer ') ? auth.verifyToken(header.slice(7)) : null;
    if (!decoded || decoded.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Sign in as this restaurant to add another login' });
    }
  }

  const result = auth.registerMerchant(email, password, restaurantId || null);
  if (result.error) return res.status(409).json({ error: result.error });
  res.status(201).json(result);
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const result = auth.loginMerchant(email, password);
  if (result.error) return res.status(401).json({ error: result.error });
  res.json(result);
});

app.get('/api/auth/me', auth.authMiddleware, (req, res) => {
  const merchant = db.prepare('SELECT id, email, restaurant_id FROM merchants WHERE id = ?').get(req.merchant.id);
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
  res.json(merchant);
});

// --- Payment routes --------------------------------------------------------

// Tells the frontend whether real card payment is available (and the public key)
app.get('/api/payments/config', (req, res) => {
  res.json({
    enabled: payments.isConfigured() && Boolean(payments.publishableKey()),
    publishableKey: payments.publishableKey(),
    currency: payments.CURRENCY,
  });
});

// Apple Pay domain verification: Stripe checks this exact path when you add
// the domain under Settings -> Payment method domains. We serve Stripe's
// canonical association file (cached in memory).
let applePayFile = null;
app.get('/.well-known/apple-developer-merchantid-domain-association', async (req, res) => {
  try {
    if (!applePayFile) {
      const r = await fetch('https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association');
      if (!r.ok) throw new Error('fetch failed');
      applePayFile = Buffer.from(await r.arrayBuffer());
    }
    res.type('application/octet-stream').send(applePayFile);
  } catch {
    res.status(502).send('unavailable');
  }
});

app.post('/api/payments/create', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  // SECURITY: the charge amount is read from the order itself — a client
  // could otherwise create an intent for less than the order total.
  const ord = db.prepare(`
    SELECT o.pickup_code, o.total, o.payment_status, r.id as restaurant_id, r.name as restaurant_name
    FROM orders o JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = ?
  `).get(orderId);
  if (!ord) return res.status(404).json({ error: 'Order not found' });
  if (ord.payment_status === 'paid' || ord.payment_status === 'paid_in_store') return res.status(409).json({ error: 'Order is already paid' });
  const amount = ord.total;

  const meta = {
    orderId,
    restaurant_id: ord?.restaurant_id || '',
    location: ord?.restaurant_name || '',
    pickup_code: ord?.pickup_code || '',
  };
  const description = ord ? `${ord.restaurant_name} · order ${ord.pickup_code}` : `App-Thru order ${orderId}`;

  // Signed-in customer? Attach their Stripe customer so cards can be saved/reused.
  let piOpts = {};
  if (payments.savedCardsEnabled()) {
    try {
      const row = db.prepare('SELECT c.* FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').get(orderId);
      if (row) {
        const scid = await payments.ensureStripeCustomer(row);
        if (scid && scid !== row.stripe_customer_id) db.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?').run(scid, row.id);
        if (scid) piOpts.customer = scid;
      }
    } catch (e) { console.warn('[saved-cards] skipped on intent:', e.message); }
  }
  const result = await payments.createPaymentIntent(amount, meta, 'card', description, piOpts);
  if (!result.success) return res.status(500).json({ error: result.error });

  const paymentId = uuidv4();
  db.prepare('INSERT INTO payments (id, order_id, stripe_payment_intent, amount_cents, status) VALUES (?, ?, ?, ?, ?)').run(
    paymentId, orderId, result.paymentIntentId, result.amount, 'pending',
  );

  res.json({ paymentId, ...result });
});

app.post('/api/payments/confirm', async (req, res) => {
  const { paymentId, paymentIntentId } = req.body;

  const result = await payments.confirmPayment(paymentIntentId);
  if (result.success && (result.dev || result.status === 'succeeded')) {
    db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('succeeded', paymentId);
    const payment = db.prepare('SELECT order_id FROM payments WHERE id = ?').get(paymentId);
    if (payment) {
      db.prepare("UPDATE orders SET payment_status = 'paid', payment_id = ? WHERE id = ?").run(paymentId, payment.order_id);

      // If this order was held for payment, release it to the kitchen now
      const ord = db.prepare(`
        SELECT o.*, r.name as restaurant_name, r.notification_phone, r.notification_email
        FROM orders o JOIN restaurants r ON o.restaurant_id = r.id
        WHERE o.id = ?
      `).get(payment.order_id);
      // Phone order paid by text link: settle the open Clover ticket
      if (ord && ord.source === 'phone' && ord.clover_order_id) {
        const rest = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(ord.restaurant_id);
        clover.markOrderPaid(rest, ord.clover_order_id, ord.total, ord.pickup_code).catch(() => {});
      }
      if (ord && ord.status === 'awaiting_payment') {
        db.prepare("UPDATE orders SET status = 'preparing' WHERE id = ?").run(ord.id);
        if (ord.customer_phone) {
          sms.notifyOrderPlaced({
            customer_name: ord.customer_name || 'there',
            customer_phone: ord.customer_phone,
            restaurant_name: ord.restaurant_name,
            pickup_code: ord.pickup_code,
          }).catch(() => {});
        }
        sms.notifyRestaurantNewOrder(
          { pickup_code: ord.pickup_code, items: ord.items, total: ord.total, customer_name: ord.customer_name, note: ord.note, location_name: ord.restaurant_name },
          ord.notification_phone,
        ).catch(() => {});
        email.notifyRestaurantNewOrder(
          { pickup_code: ord.pickup_code, items: ord.items, total: ord.total, customer_name: ord.customer_name, customer_phone: ord.customer_phone, note: ord.note },
          ord.notification_email,
          ord.restaurant_name,
        ).catch(() => {});
        clover.pushOrder({
          pickup_code: ord.pickup_code,
          items: JSON.parse(ord.items || '[]'),
          subtotal: ord.subtotal, tax: ord.tax, service_fee: ord.service_fee, total: ord.total,
          customer_name: ord.customer_name, note: ord.note, restaurant_name: ord.restaurant_name,
          restaurant_id: ord.restaurant_id,
        }).catch(() => {});
      }
    }
  }

  res.json(result);
});

// --- API Routes ---

// Get all categories
app.get('/api/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.* FROM categories c
    WHERE c.name IN (SELECT DISTINCT r.cuisine FROM restaurants r WHERE r.id IN (SELECT restaurant_id FROM merchants WHERE restaurant_id IS NOT NULL))
  `).all();
  res.json(categories);
});

// Get all restaurants (with optional filters)
// Never expose private restaurant settings on public endpoints
const PRIVATE_RESTAURANT_FIELDS = ['clover_mid', 'clover_token', 'notification_phone', 'notification_email'];
function publicRestaurant(r) {
  if (!r) return r;
  const out = { ...r };
  PRIVATE_RESTAURANT_FIELDS.forEach(k => { delete out[k]; });
  return out;
}

app.get('/api/restaurants', (req, res) => {
  const { cuisine, search, featured } = req.query;
  // Only real, onboarded restaurants (ones with a merchant account) are listed
  let query = 'SELECT r.* FROM restaurants r WHERE r.id IN (SELECT restaurant_id FROM merchants WHERE restaurant_id IS NOT NULL)';
  const params = [];

  if (cuisine) {
    query += ' AND r.cuisine = ?';
    params.push(cuisine);
  }
  if (search) {
    query += ' AND (r.name LIKE ? OR r.cuisine LIKE ? OR r.description LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (featured === 'true') {
    query += ' AND r.featured = 1';
  }

  query += ' ORDER BY r.name ASC';
  const restaurants = db.prepare(query).all(...params);
  res.json(restaurants.map(publicRestaurant));
});

// Get single restaurant with menu
app.get('/api/restaurants/:id', (req, res) => {
  const restaurant = db.prepare('SELECT r.* FROM restaurants r WHERE r.id = ? AND r.id IN (SELECT restaurant_id FROM merchants WHERE restaurant_id IS NOT NULL)').get(req.params.id);
  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const menuItems = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND available != 0 ORDER BY popular DESC, name ASC').all(req.params.id);

  // Group menu items by category
  const menuByCategory = {};
  for (const item of menuItems) {
    const cat = item.category || 'Other';
    if (!menuByCategory[cat]) menuByCategory[cat] = [];
    menuByCategory[cat].push(item);
  }

  res.json({ ...publicRestaurant(restaurant), menu: menuByCategory, menuItems });
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
    WHERE (mi.name LIKE ? OR mi.description LIKE ? OR mi.category LIKE ?)
      AND r.id IN (SELECT restaurant_id FROM merchants WHERE restaurant_id IS NOT NULL) AND mi.available != 0
    LIMIT 20
  `).all(term, term, term);

  res.json(items);
});

// Generate a short, human-friendly pickup code (e.g. "A7K4")
function generatePickupCode(customerName) {
  // Tag-style code: first letter of the customer's name + 2 digits (e.g. L-42)
  const m = String(customerName || '').trim().match(/[A-Za-z]/);
  const initial = m ? m[0].toUpperCase() : 'A';
  const digits = String(Math.floor(Math.random() * 90) + 10); // 10-99
  return `${initial}-${digits}`;
}

// Dish-aware prep estimate: drinks are fast, food takes longer
const PREP_BY_CATEGORY = {
  'chai': 8, 'coffee': 8, 'cold coffee': 8, 'cold drinks': 6, 'shakes': 8,
  'ice cream': 5, 'bagels': 10, 'sweets': 8, 'sides': 10,
  'pakora': 15, 'finger food': 15,
  'burgers': 18, 'sandwiches': 15, 'wraps': 15, "parantha's": 15, 'meals': 18,
};
function estimatePrepMinutes(items) {
  let maxPrep = 0;
  for (const it of (items || [])) {
    const cat = String(it.category || '').toLowerCase().trim();
    maxPrep = Math.max(maxPrep, PREP_BY_CATEGORY[cat] ?? 12);
  }
  return Math.max(5, maxPrep || 12);
}

// Create an order (delivery OR walk-up pickup)
app.post('/api/orders', orderLimiter, (req, res) => {
  const {
    restaurant_id,
    items,
    delivery_address,
    order_type,
    customer_name,
    customer_phone,
  } = req.body;
  const note = String(req.body.note || '').trim().slice(0, 300);

  if (!restaurant_id || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const type = order_type === 'dinein' ? 'dinein' : (order_type === 'pickup' ? 'pickup' : 'delivery');

  if ((type === 'pickup' || type === 'dinein') && !customer_phone) {
    return res.status(400).json({ error: 'Phone number is required for walk-up pickup' });
  }

  const restaurant = db.prepare('SELECT r.* FROM restaurants r WHERE r.id = ? AND r.id IN (SELECT restaurant_id FROM merchants WHERE restaurant_id IS NOT NULL)').get(restaurant_id);
  if (!restaurant) {
    return res.status(404).json({ error: 'This restaurant is not taking orders' });
  }

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  // Walk-up pickup = no delivery fee (that's the whole point!)
  const delivery_fee = type !== 'delivery' ? 0 : restaurant.delivery_fee;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const service_fee = APPTHRU_FEE;
  const total = Math.round((subtotal + delivery_fee + tax + service_fee) * 100) / 100;

  const orderId = uuidv4();
  const pickupCode = type !== 'delivery' ? generatePickupCode(customer_name) : null;
  // Card-paid orders stay hidden from the kitchen until payment succeeds
  const payFirst = Boolean(req.body.pay_first);
  const initialStatus = payFirst ? 'awaiting_payment' : (type !== 'delivery' ? 'preparing' : 'confirmed');

  db.prepare(`
    INSERT INTO orders (
      id, restaurant_id, items, subtotal, delivery_fee, tax, service_fee, total,
      delivery_address, order_type, pickup_code, customer_name, customer_phone, status, note, customer_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId, restaurant_id, JSON.stringify(items), subtotal, delivery_fee, tax, service_fee, total,
    delivery_address || '', type, pickupCode, customer_name || '', customer_phone || '',
    initialStatus, note, auth.optionalCustomerId(req),
  );

  // Notifications go out now for pay-at-pickup orders; card orders notify
  // only after the payment succeeds (see /api/payments/confirm)
  if (!payFirst) {
    if (type !== 'delivery' && customer_phone) {
      sms.notifyOrderPlaced({
        customer_name: customer_name || 'there',
        customer_phone,
        restaurant_name: restaurant.name,
        pickup_code: pickupCode,
      }).catch(() => {});
    }
    sms.notifyRestaurantNewOrder(
      { pickup_code: pickupCode, items, total, customer_name, note, location_name: restaurant.name },
      restaurant.notification_phone,
    ).catch(() => {});
    email.notifyRestaurantNewOrder(
      { pickup_code: pickupCode, items, total, customer_name, customer_phone, note },
      restaurant.notification_email,
      restaurant.name,
    ).catch(() => {});
    clover.pushOrder({
      pickup_code: pickupCode, items, subtotal, tax, service_fee, total,
      customer_name, note, restaurant_name: restaurant.name, restaurant_id: restaurant.id,
    }).catch(() => {});
  }

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

// ---- Phone (call-in) orders: staff enter the order, customer pays by tap at pickup ----
app.post('/api/merchants/:id/phone-orders', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

  const customer_name = String(req.body.customer_name || '').trim().slice(0, 60);
  const phoneDigits = String(req.body.customer_phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const note = String(req.body.note || '').trim().slice(0, 300);
  const type = req.body.order_type === 'dinein' ? 'dinein' : 'pickup';
  const payMethod = req.body.pay_method === 'link' ? 'link' : 'pickup';
  if (!customer_name) return res.status(400).json({ error: "Enter the customer's name" });
  if (phoneDigits.length !== 10) return res.status(400).json({ error: 'Enter a 10-digit phone number' });

  const reqItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 60) : [];
  if (!reqItems.length) return res.status(400).json({ error: 'Add at least one item' });

  // Prices always come from the menu, never from the request
  const items = [];
  for (const ri of reqItems) {
    const mi = db.prepare('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?').get(ri.menu_item_id, restaurant.id);
    if (!mi) return res.status(400).json({ error: 'An item is no longer on the menu' });
    let price = Number(mi.price), name = mi.name;
    if (ri.option) {
      let opts = [];
      try { opts = JSON.parse(mi.options || '[]'); } catch {}
      const opt = Array.isArray(opts) ? opts.find(o => o && o.name === ri.option) : null;
      if (!opt) return res.status(400).json({ error: `Pick a size for ${mi.name}` });
      price = Number(opt.price); name = `${mi.name} (${opt.name})`;
    }
    const quantity = Math.min(50, Math.max(1, parseInt(ri.quantity, 10) || 1));
    items.push({ id: ri.option ? `${mi.id}::${ri.option}` : mi.id, name, price, quantity, category: mi.category || '' });
  }

  const subtotal = Math.round(items.reduce((s2, it) => s2 + it.price * it.quantity, 0) * 100) / 100;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const service_fee = PHONE_ORDER_FEE;
  const total = Math.round((subtotal + tax + service_fee) * 100) / 100;
  const orderId = uuidv4();
  const pickupCode = generatePickupCode(customer_name);

  db.prepare(`
    INSERT INTO orders (
      id, restaurant_id, items, subtotal, delivery_fee, tax, service_fee, total,
      delivery_address, order_type, pickup_code, customer_name, customer_phone, status, note,
      payment_status, source
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, '', ?, ?, ?, ?, 'preparing', ?, 'unpaid', 'phone')
  `).run(orderId, restaurant.id, JSON.stringify(items), subtotal, tax, service_fee, total,
    type, pickupCode, customer_name, phoneDigits, note);

  sms.notifyPhoneOrderPlaced({
    id: orderId, customer_name, customer_phone: phoneDigits,
    restaurant_name: restaurant.name, pickup_code: pickupCode, total, payLink: payMethod === 'link',
  }).catch(() => {});
  clover.pushOrder({
    pickup_code: pickupCode, items, subtotal, tax, service_fee, total,
    customer_name, note, restaurant_name: restaurant.name, restaurant_id: restaurant.id, unpaid: true,
  }).then(cid => {
    if (typeof cid === 'string') db.prepare('UPDATE orders SET clover_order_id = ? WHERE id = ?').run(cid, orderId);
  }).catch(() => {});

  res.status(201).json({ id: orderId, pickup_code: pickupCode, subtotal, tax, service_fee, total, items, status: 'preparing', payment_status: 'unpaid', source: 'phone', pay_method: payMethod });
});

// Staff confirm a phone order was paid (card tapped on the terminal)
app.post('/api/orders/:id/mark-paid', auth.authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.restaurant_id !== req.merchant.restaurantId) {
    return res.status(403).json({ error: 'You do not have access to this order' });
  }
  db.prepare("UPDATE orders SET payment_status = 'paid_in_store' WHERE id = ?").run(order.id);
  res.json({ id: order.id, payment_status: 'paid_in_store' });
});

// Update order status (e.g. staff marking as ready / picked up)
app.patch('/api/orders/:id/status', auth.authMiddleware, (req, res) => {
  const { status } = req.body;
  const allowed = ['preparing', 'ready', 'picked_up', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.restaurant_id !== req.merchant.restaurantId) {
    return res.status(403).json({ error: 'You do not have access to this order' });
  }

  const now = new Date().toISOString();
  const readyAt = status === 'ready' ? now : order.ready_at;
  const pickedUpAt = status === 'picked_up' ? now : order.picked_up_at;

  db.prepare(`
    UPDATE orders SET status = ?, ready_at = ?, picked_up_at = ? WHERE id = ?
  `).run(status, readyAt, pickedUpAt, req.params.id);

  const updated = db.prepare(`
    SELECT o.*, r.name as restaurant_name FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = ?
  `).get(req.params.id);
  updated.items = JSON.parse(updated.items);

  // Send SMS when order is ready
  if (status === 'ready' && updated.customer_phone) {
    sms.notifyOrderReady(updated).catch(() => {});
  }

  res.json(updated);
});

// Get all walk-up orders for staff / kitchen view (pickup AND dine-in)
app.get('/api/pickup-orders', auth.authMiddleware, async (req, res) => {
  // Safety net: if a customer paid but closed the page before the final
  // confirm call, the order can be stuck in awaiting_payment. Reconcile the
  // few most recent ones against Stripe and release any that actually paid.
  try {
    const stuck = db.prepare(`
      SELECT o.id as order_id, p.id as payment_id, p.stripe_payment_intent as provider_payment_id
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.restaurant_id = ? AND o.status = 'awaiting_payment'
        AND o.created_at >= datetime('now', '-12 hours')
      LIMIT 5
    `).all(req.merchant.restaurantId);
    for (const row of stuck) {
      if (!row.provider_payment_id || String(row.provider_payment_id).startsWith('dev_')) continue;
      const check = await payments.confirmPayment(row.provider_payment_id).catch(() => null);
      if (check && check.success && check.status === 'succeeded') {
        db.prepare("UPDATE payments SET status = 'succeeded' WHERE id = ?").run(row.payment_id);
        db.prepare("UPDATE orders SET status = 'preparing', payment_status = 'paid', payment_id = ? WHERE id = ?")
          .run(row.payment_id, row.order_id);
        console.log('[reconcile] released stuck paid order', row.order_id);
      }
    }
  } catch (e) { console.warn('[reconcile] skipped:', e.message); }

  const orders = db.prepare(`
    SELECT o.*, r.name as restaurant_name
    FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id
    WHERE o.order_type IN ('pickup', 'dinein')
      AND o.status NOT IN ('picked_up', 'cancelled', 'awaiting_payment')
      AND o.created_at >= datetime('now', '-12 hours')
      AND o.restaurant_id = ?
    ORDER BY o.created_at DESC  -- newest orders first on the live queue
  `).all(req.merchant.restaurantId);
  orders.forEach(o => { o.items = JSON.parse(o.items); });
  res.json(orders);
});

// Get order by ID (includes queue position + ETA for pickup orders)
app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, r.name as restaurant_name, r.image as restaurant_image, r.prep_minutes as restaurant_prep_minutes, r.notification_phone as restaurant_phone
    FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  order.items = JSON.parse(order.items);

  if ((order.order_type === 'pickup' || order.order_type === 'dinein') && order.status === 'preparing') {
    const ahead = db.prepare(`
      SELECT COUNT(*) as cnt FROM orders
      WHERE order_type IN ('pickup', 'dinein')
        AND status = 'preparing'
        AND restaurant_id = ?
        AND created_at < ?
    `).get(order.restaurant_id, order.created_at);
    order.queue_position = (ahead?.cnt || 0) + 1;
    // Dish-aware prep (drinks fast, food longer) + 3 min per order ahead, capped
    const prep = estimatePrepMinutes(order.items);
    order.estimated_minutes = Math.min(45, prep + (order.queue_position - 1) * 3);
  } else if (order.order_type === 'pickup' && order.status === 'ready') {
    order.queue_position = 0;
    order.estimated_minutes = 0;
  }

  // Minimize exposed PII on this public-by-link endpoint
  if (order.customer_phone) {
    order.customer_phone = '•••••' + String(order.customer_phone).slice(-4);
  }

  res.json(order);
});

// Customer-initiated cancel: within 5 minutes, while still preparing.
// Auto-refunds the Stripe payment in full. (Order id is an unguessable UUID,
// so only the device that placed the order can reach it.)
app.post('/api/orders/:id/cancel', orderLimiter, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['preparing', 'awaiting_payment'].includes(order.status)) {
    return res.status(409).json({ error: 'This order is already being completed and can no longer be cancelled. Please contact the restaurant.' });
  }
  const ageMin = (Date.now() - new Date(order.created_at.replace(' ', 'T') + 'Z').getTime()) / 60000;
  if (ageMin > 5) {
    return res.status(409).json({ error: 'The 5-minute cancel window has passed. Please contact the restaurant.' });
  }

  let refunded = false;
  if (order.payment_status === 'paid' && order.payment_id) {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(order.payment_id);
    if (pay && pay.stripe_payment_intent) {
      const result = await payments.refundPayment(pay.stripe_payment_intent);
      if (!result.success) {
        return res.status(502).json({ error: 'Refund failed — please contact the restaurant to cancel.' });
      }
      refunded = true;
      db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(order.payment_id);
    }
  }
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);

  // Let the restaurant know so the kitchen stops making it
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(order.restaurant_id);
  if (r) {
    sms.notifyRestaurantNewOrder(
      { pickup_code: order.pickup_code, items: `CANCELLED by customer${refunded ? ' (refunded)' : ''}`, total: order.total, customer_name: order.customer_name, note: 'ORDER CANCELLED — do not prepare', location_name: r.name },
      r.notification_phone,
    ).catch(() => {});
  }

  res.json({ ok: true, refunded });
});

// Clover connection test (merchant-only)
app.get('/api/clover/test', auth.authMiddleware, async (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.merchant.restaurantId);
  res.json(await clover.testConnection(r));
});

// ---- Customer accounts (mobile app) -------------------------------------
app.post('/api/customers/register', authLimiter, (req, res) => {
  const r = auth.registerCustomer(req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(r);
});

app.post('/api/customers/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const r = auth.loginCustomer(email, password);
  if (r.error) return res.status(401).json({ error: r.error });
  res.json(r);
});

const oauth = require('./oauth');
app.get('/api/auth/social-config', (req, res) => res.json(oauth.publicConfig()));

app.post('/api/customers/social', authLimiter, async (req, res) => {
  const { provider, idToken, name } = req.body || {};
  try {
    const ident = await oauth.verifyIdToken(provider, idToken);
    res.json(auth.socialCustomer(provider, ident, { name }));
  } catch (e) {
    console.warn('[social-login]', provider, e.message);
    res.status(401).json({ error: 'Sign-in failed — please try again' });
  }
});

// Saved cards: a short-lived session that lets checkout show this customer's cards
app.post('/api/payments/customer-session', auth.customerAuth, async (req, res) => {
  if (!payments.savedCardsEnabled()) return res.json({ enabled: false });
  try {
    const scid = await payments.ensureStripeCustomer(req.customer);
    if (scid !== req.customer.stripe_customer_id) db.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?').run(scid, req.customer.id);
    res.json({ enabled: true, customerSessionClientSecret: await payments.createCustomerSession(scid) });
  } catch (e) {
    console.warn('[saved-cards] session failed:', e.message);
    res.json({ enabled: false });
  }
});

app.get('/api/customers/me', auth.customerAuth, (req, res) => {
  res.json({ customer: auth.customerPublic(req.customer) });
});

app.patch('/api/customers/me', auth.customerAuth, (req, res) => {
  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 60) : req.customer.name;
  const phone = req.body.phone !== undefined ? String(req.body.phone).replace(/\D/g, '').slice(-10) : req.customer.phone;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (phone && phone.length !== 10) return res.status(400).json({ error: 'Phone number must be 10 digits' });
  db.prepare('UPDATE customers SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.customer.id);
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
  res.json({ customer: auth.customerPublic(c) });
});

// Account deletion (App Store guideline 5.1.1(v)). Order records stay for
// tax/accounting but are detached from the account.
app.delete('/api/customers/me', auth.customerAuth, (req, res) => {
  const row = db.prepare('SELECT stripe_customer_id FROM customers WHERE id = ?').get(req.customer.id);
  if (row && row.stripe_customer_id) payments.deleteStripeCustomer(row.stripe_customer_id);
  db.prepare('UPDATE orders SET customer_id = NULL WHERE customer_id = ?').run(req.customer.id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.customer.id);
  res.json({ ok: true });
});

app.get('/api/customers/me/orders', auth.customerAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.pickup_code, o.status, o.total, o.items, o.created_at, o.order_type,
           r.name as restaurant_name, r.image as restaurant_image
    FROM orders o JOIN restaurants r ON o.restaurant_id = r.id
    WHERE o.customer_id = ? AND o.status != 'awaiting_payment'
    ORDER BY o.created_at DESC LIMIT 50
  `).all(req.customer.id);
  orders.forEach(o => { try { o.items = JSON.parse(o.items); } catch { o.items = []; } });
  res.json(orders);
});

// Order history for ONE device: returns only the explicitly requested ids
// (UUIDs are unguessable, so a device can only ever fetch its own orders)
app.get('/api/orders', (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map(x => x.trim())
    .filter(x => /^[0-9a-f-]{36}$/i.test(x))
    .slice(0, 20);
  if (!ids.length) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  const orders = db.prepare(`
    SELECT o.*, r.name as restaurant_name, r.image as restaurant_image
    FROM orders o
    JOIN restaurants r ON o.restaurant_id = r.id
    WHERE o.id IN (${placeholders})
    ORDER BY o.created_at DESC
  `).all(...ids);
  orders.forEach(o => { o.items = JSON.parse(o.items); });
  res.json(orders);
});

// Public order-status board for an in-store screen: codes + first names only
app.get('/api/restaurants/:id/board', (req, res) => {
  const rows = db.prepare(`
    SELECT pickup_code, customer_name, status FROM orders
    WHERE restaurant_id = ? AND order_type IN ('pickup', 'dinein')
      AND status IN ('preparing', 'ready')
      AND created_at >= datetime('now', '-12 hours')
    ORDER BY created_at ASC
  `).all(req.params.id);
  res.json(rows.map(r => ({
    code: r.pickup_code,
    name: (r.customer_name || '').trim().split(/\s+/)[0] || '',
    status: r.status,
  })));
});

// --- AI Drive-through voice agent ----------------------------------------

// Start a new voice ordering session (optionally scoped to a restaurant for kiosk mode)
app.post('/api/agent/session', (req, res) => {
  const { restaurantId } = req.body || {};
  const sessionId = uuidv4();
  const opts = restaurantId ? { restaurantId } : {};
  const session = agent.getSession(sessionId, opts);
  const { reply } = agent.handleTurn(session, '');
  if (llmAgent.available()) {
    // Give the LLM the greeting so the conversation has a consistent start
    session.llmHistory = [
      { role: 'user', content: '(customer walked up)' },
      { role: 'assistant', content: JSON.stringify({ say: reply, restaurant_id: session.restaurant?.id || null, items: [], customer_name: null, phone: null, confirmed: false }) },
    ];
  }
  res.json({ sessionId, reply, state: publicState(session), kioskMode: session.kioskMode });
});

// Send a user utterance; get the agent's reply back
app.post('/api/agent/message', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !agent.sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Unknown session. Start a new one.' });
  }
  const session = agent.getSession(sessionId);
  let result;
  if (llmAgent.available()) {
    try {
      result = await llmAgent.turn(session, message || '');
    } catch (e) {
      console.error('LLM agent failed, using rule-based fallback:', e.message);
      result = agent.handleTurn(session, message || '');
    }
  } else {
    result = agent.handleTurn(session, message || '');
  }

  // Special sentinel: agent wants to actually place the order now.
  if (result.reply === '__PLACE_ORDER__') {
    const { subtotal, tax, serviceFee, total } = agent.summarize(session);
    const orderId = uuidv4();
    const pickupCode = generatePickupCode(customer_name);
    db.prepare(`
      INSERT INTO orders (
        id, restaurant_id, items, subtotal, delivery_fee, tax, service_fee, total,
        delivery_address, order_type, pickup_code, customer_name, customer_phone, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pickup', ?, ?, ?, 'preparing')
    `).run(
      orderId, session.restaurant.id, JSON.stringify(session.items),
      subtotal, 0, tax, serviceFee, total, '', pickupCode,
      session.name, session.phone,
    );
    session.stage = 'placed';
    session.orderId = orderId;
    session.pickupCode = pickupCode;

    // Send SMS confirmation
    sms.notifyOrderPlaced({
      customer_name: session.name,
      customer_phone: session.phone,
      restaurant_name: session.restaurant.name,
      pickup_code: pickupCode,
    }).catch(() => {});

    // Text the restaurant too
    const freshRestaurant = db.prepare('SELECT name, notification_phone, notification_email FROM restaurants WHERE id = ?').get(session.restaurant.id);
    sms.notifyRestaurantNewOrder(
      { pickup_code: pickupCode, items: session.items, total, customer_name: session.name, location_name: freshRestaurant?.name },
      freshRestaurant?.notification_phone,
    ).catch(() => {});
    email.notifyRestaurantNewOrder(
      { pickup_code: pickupCode, items: session.items, total, customer_name: session.name, customer_phone: session.phone },
      freshRestaurant?.notification_email,
      freshRestaurant?.name,
    ).catch(() => {});

    const confirmationReply = result.spokenConfirmation
      ? `${result.spokenConfirmation} Your pickup code is ${pickupCode.split('').join(' ')}.`
      : `Awesome, you're all set ${session.name}! Your pickup code is ${pickupCode.split('').join(' ')}. ` +
        `We'll send a text to your phone when your food is ready. ` +
        `Just walk up and show your code. Enjoy!`;
    return res.json({
      reply: confirmationReply,
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
  const menuItems = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND available != 0 ORDER BY popular DESC, name ASC').all(req.params.id);
  const popular = menuItems.filter(m => m.popular);
  res.json({ restaurant: r, menuItems, popular });
});

// Update restaurant drive-thru config (admin onboarding)
app.patch('/api/restaurants/:id/config', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });

  const { greeting, supported_languages, default_language, agent_voice, pickup_instructions, drive_thru_enabled, prep_minutes, delivery_time, notification_phone } = req.body;
  const fields = [];
  const values = [];

  if (greeting !== undefined) { fields.push('greeting = ?'); values.push(greeting); }
  if (supported_languages !== undefined) { fields.push('supported_languages = ?'); values.push(supported_languages); }
  if (default_language !== undefined) { fields.push('default_language = ?'); values.push(default_language); }
  if (agent_voice !== undefined) { fields.push('agent_voice = ?'); values.push(agent_voice); }
  if (pickup_instructions !== undefined) { fields.push('pickup_instructions = ?'); values.push(pickup_instructions); }
  if (drive_thru_enabled !== undefined) { fields.push('drive_thru_enabled = ?'); values.push(drive_thru_enabled ? 1 : 0); }
  if (prep_minutes !== undefined) { fields.push('prep_minutes = ?'); values.push(Math.max(1, Math.min(180, parseInt(prep_minutes, 10) || 15))); }
  if (delivery_time !== undefined) { fields.push('delivery_time = ?'); values.push(String(delivery_time).slice(0, 30)); }
  if (notification_phone !== undefined) { fields.push('notification_phone = ?'); values.push(String(notification_phone).replace(/[^\d+]/g, '').slice(0, 20)); }
  if (req.body.image !== undefined) { fields.push('image = ?'); values.push(String(req.body.image).slice(0, 500)); }
  if (req.body.notification_email !== undefined) { fields.push('notification_email = ?'); values.push(String(req.body.notification_email).trim().slice(0, 120)); }
  if (req.body.clover_mid !== undefined) { fields.push('clover_mid = ?'); values.push(String(req.body.clover_mid).trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20)); }
  if (req.body.clover_token !== undefined && String(req.body.clover_token).trim() !== '••••••') { fields.push('clover_token = ?'); values.push(String(req.body.clover_token).trim().slice(0, 200)); }
  if (req.body.name !== undefined && String(req.body.name).trim()) { fields.push('name = ?'); values.push(String(req.body.name).trim().slice(0, 80)); }
  if (req.body.address !== undefined) { fields.push('address = ?'); values.push(String(req.body.address).slice(0, 160)); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE restaurants SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  res.json(merchantRestaurant(updated));
});

// Private settings for the restaurant's own dashboard (token never returned)
function merchantRestaurant(r) {
  const out = { ...r };
  out.clover_connected = Boolean(r.clover_mid && r.clover_token);
  out.clover_token = r.clover_token ? '••••••' : '';
  return out;
}

app.get('/api/merchants/:id/settings', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(merchantRestaurant(r));
});

app.get('/api/merchants/:id/clover/test', auth.authMiddleware, requireRestaurantOwnership, async (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  res.json(await clover.testConnection(r));
});

// --- Natural voice (ElevenLabs) --------------------------------------------

const voiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // a kiosk conversation makes many short calls
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Voice service is busy, please try again shortly' },
});

// Lets the kiosk know whether to use natural voice or the browser fallback
app.get('/api/voice/status', (req, res) => {
  res.json({ tts: voice.available(), stt: voice.available() });
});

app.post('/api/voice/tts', voiceLimiter, async (req, res) => {
  if (!voice.available()) return res.status(503).json({ error: 'Natural voice not configured' });
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.length > 600) {
    return res.status(400).json({ error: 'text (max 600 chars) is required' });
  }
  try {
    const audio = await voice.tts(text);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(audio);
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: 'Voice generation failed' });
  }
});

app.post('/api/voice/stt', voiceLimiter, express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
  if (!voice.available()) return res.status(503).json({ error: 'Speech recognition not configured' });
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Audio body required' });
  try {
    const result = await voice.stt(req.body, req.headers['content-type'] || 'audio/webm');
    res.json(result);
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: 'Speech recognition failed' });
  }
});

// --- Menu import (pre-fills the menu editor during registration) ----------

// Import from a public menu web page (or a direct PDF link)
app.post('/api/menu-import/url', importLimiter, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const result = await menuImport.importFromUrl(url);
    if (!result.items.length) {
      return res.status(422).json({ error: 'No menu items with prices found on that page. Try a page that lists dishes with prices, or upload a PDF.' });
    }
    res.json(result);
  } catch (e) {
    res.status(422).json({ error: e.name === 'AbortError' ? 'That page took too long to load' : e.message });
  }
});

// Import from an uploaded PDF (raw application/pdf body, max 15 MB)
app.post('/api/menu-import/pdf', importLimiter, express.raw({ type: 'application/pdf', limit: '15mb' }), async (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Send the PDF file as the request body with Content-Type: application/pdf' });
  try {
    const result = await menuImport.importFromPdf(req.body);
    if (!result.items.length) {
      return res.status(422).json({ error: 'No menu items with prices found in that PDF. If it\'s a scanned image, type the menu in manually for now.' });
    }
    res.json(result);
  } catch (e) {
    res.status(422).json({ error: 'Could not read that PDF: ' + e.message });
  }
});

// --- Merchant registration (like Uber Eats / DoorDash merchant signup) ----

// Register a new restaurant + menu
app.post('/api/merchants/register', authLimiter, (req, res) => {
  const {
    name, cuisine, description, address, image,
    delivery_time, delivery_fee, min_order,
    greeting, pickup_instructions, menuItems,
    email, password,
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
      INSERT INTO menu_items (id, restaurant_id, name, description, price, image, category, popular, options)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        cleanOptions(item.options),
      );
    }
  }

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);

  // Create merchant account if email + password provided
  let authResult = null;
  if (email && password) {
    authResult = auth.registerMerchant(email, password, restaurantId);
    if (authResult.error) {
      return res.status(409).json({ error: authResult.error });
    }
  }

  res.status(201).json({
    restaurant,
    menuItems: items,
    merchant: authResult?.merchant || null,
    token: authResult?.token || null,
    links: {
      kiosk: `/kiosk/${restaurantId}`,
      admin: `/admin/${restaurantId}`,
      kitchen: '/kitchen',
    },
  });
});

// Update menu items for a restaurant
app.put('/api/restaurants/:id/menu', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });

  const { menuItems } = req.body;
  if (!menuItems) return res.status(400).json({ error: 'menuItems required' });

  // Remove old items and replace
  db.prepare('DELETE FROM menu_items WHERE restaurant_id = ?').run(req.params.id);
  const stmt = db.prepare(`
    INSERT INTO menu_items (id, restaurant_id, name, description, price, image, category, popular, options)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      cleanOptions(item.options),
    );
  }

  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(req.params.id);
  res.json(items);
});

// Full menu for the merchant portal (includes sold-out items)
app.get('/api/merchants/:id/menu', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY category, name').all(req.params.id);
  res.json(items);
});

// Mark an item sold out / available (86 it)
app.patch('/api/menu-items/:itemId/availability', auth.authMiddleware, (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.restaurant_id !== req.merchant.restaurantId) {
    return res.status(403).json({ error: 'You do not have access to this item' });
  }
  const available = req.body.available ? 1 : 0;
  db.prepare('UPDATE menu_items SET available = ? WHERE id = ?').run(available, req.params.itemId);
  res.json({ id: item.id, available });
});

// Accounting export: this location's orders as CSV (open in Excel)
// Full order history (JSON) for the merchant portal
app.get('/api/merchants/:id/orders', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const orders = db.prepare(`
    SELECT id, pickup_code, customer_name, items, subtotal, tax, service_fee, total,
           status, payment_status, order_type, note, source, created_at, ready_at, picked_up_at
    FROM orders
    WHERE restaurant_id = ? AND status != 'awaiting_payment'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(req.params.id, limit);
  orders.forEach(o => { try { o.items = JSON.parse(o.items); } catch { o.items = []; } });
  res.json(orders);
});

app.get('/api/merchants/:id/orders.csv', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const rows = db.prepare(`
    SELECT created_at, pickup_code, customer_name, status, payment_status,
           subtotal, tax, service_fee, total, items
    FROM orders
    WHERE restaurant_id = ? AND status NOT IN ('awaiting_payment')
    ORDER BY created_at DESC
    LIMIT 5000
  `).all(req.params.id);
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = ['date_utc,pickup_code,customer,status,payment_status,subtotal,tax,appthru_fee,total,items'];
  for (const r of rows) {
    let items = '';
    try { items = JSON.parse(r.items).map(i => `${i.quantity}x ${i.name}`).join('; '); } catch {}
    lines.push([r.created_at, r.pickup_code, r.customer_name, r.status, r.payment_status,
      r.subtotal, r.tax, r.service_fee, r.total, items].map(esc).join(','));
  }
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="orders.csv"').send(lines.join('\n'));
});

// Get merchant dashboard stats
app.get('/api/merchants/:id/stats', auth.authMiddleware, requireRestaurantOwnership, (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Restaurant not found' });

  const totalOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE restaurant_id = ? AND status NOT IN ('awaiting_payment','cancelled')").get(req.params.id).cnt;
  const pickupOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE restaurant_id = ? AND order_type IN ('pickup','dinein')").get(req.params.id).cnt;
  const revenue = db.prepare("SELECT COALESCE(SUM(total), 0) as rev FROM orders WHERE restaurant_id = ? AND status NOT IN ('awaiting_payment','cancelled')").get(req.params.id).rev;
  const activeOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE restaurant_id = ? AND status IN ('preparing', 'ready', 'confirmed')").get(req.params.id).cnt;
  const menuCount = db.prepare('SELECT COUNT(*) as cnt FROM menu_items WHERE restaurant_id = ?').get(req.params.id).cnt;

  const day = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as rev FROM orders WHERE restaurant_id = ? AND status NOT IN ('awaiting_payment','cancelled') AND created_at >= datetime('now','-1 day')").get(req.params.id);
  const week = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as rev FROM orders WHERE restaurant_id = ? AND status NOT IN ('awaiting_payment','cancelled') AND created_at >= datetime('now','-7 day')").get(req.params.id);

  // Top sellers from the last 200 orders
  const recent = db.prepare("SELECT items FROM orders WHERE restaurant_id = ? AND status NOT IN ('awaiting_payment','cancelled') ORDER BY created_at DESC LIMIT 200").all(req.params.id);
  const counts = {};
  for (const row of recent) {
    try {
      for (const it of JSON.parse(row.items)) {
        counts[it.name] = (counts[it.name] || 0) + (it.quantity || 1);
      }
    } catch {}
  }
  const topItems = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  res.json({
    restaurant: r,
    stats: {
      totalOrders, pickupOrders, revenue: Math.round(revenue * 100) / 100, activeOrders, menuCount,
      todayOrders: day.cnt, todayRevenue: Math.round(day.rev * 100) / 100,
      weekOrders: week.cnt, weekRevenue: Math.round(week.rev * 100) / 100,
      avgOrder: totalOrders ? Math.round((revenue / totalOrders) * 100) / 100 : 0,
      topItems,
    },
  });
});

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
