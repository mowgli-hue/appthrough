const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'app-thru-dev-secret-change-in-production';
const TOKEN_EXPIRY = '7d';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(merchant) {
  return jwt.sign(
    { id: merchant.id, email: merchant.email, restaurantId: merchant.restaurant_id },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY },
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = verifyToken(header.slice(7));
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (decoded.typ === 'customer') {
    return res.status(403).json({ error: 'Merchant account required' });
  }
  req.merchant = decoded;
  next();
}

// ---- Customer accounts (separate token type; never valid for merchant routes) ----
function generateCustomerToken(c) {
  return jwt.sign({ id: c.id, typ: 'customer' }, JWT_SECRET, { expiresIn: '90d' });
}

function customerPublic(c) {
  return { id: c.id, name: c.name, phone: c.phone || '', email: c.email };
}

function customerAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required' });
  const decoded = verifyToken(header.slice(7));
  if (!decoded || decoded.typ !== 'customer') return res.status(401).json({ error: 'Please sign in again' });
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(decoded.id);
  if (!c) return res.status(401).json({ error: 'Account not found' });
  req.customer = c;
  next();
}

// Returns the customer id if the request carries a valid customer token, else null
function optionalCustomerId(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const decoded = verifyToken(header.slice(7));
  return decoded && decoded.typ === 'customer' ? decoded.id : null;
}

function registerCustomer({ name, phone, email, password }) {
  const em = String(email || '').toLowerCase().trim();
  const nm = String(name || '').trim().slice(0, 60);
  const ph = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!nm) return { error: 'Please enter your name' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { error: 'Please enter a valid email' };
  if (ph && ph.length !== 10) return { error: 'Phone number must be 10 digits' };
  if (String(password || '').length < 8) return { error: 'Password must be at least 8 characters' };
  if (db.prepare('SELECT id FROM customers WHERE email = ?').get(em)) {
    return { error: 'An account with this email already exists — please sign in' };
  }
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO customers (id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run(id, nm, ph, em, hashPassword(password));
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  return { customer: customerPublic(c), token: generateCustomerToken(c) };
}

function loginCustomer(email, password) {
  const c = db.prepare('SELECT * FROM customers WHERE email = ?').get(String(email || '').toLowerCase().trim());
  if (!c || !verifyPassword(String(password || ''), c.password_hash)) return { error: 'Wrong email or password' };
  return { customer: customerPublic(c), token: generateCustomerToken(c) };
}

function registerMerchant(email, password, restaurantId) {
  const existing = db.prepare('SELECT id FROM merchants WHERE email = ?').get(email);
  if (existing) return { error: 'Email already registered' };

  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  const hash = hashPassword(password);

  db.prepare('INSERT INTO merchants (id, email, password_hash, restaurant_id) VALUES (?, ?, ?, ?)').run(
    id, email.toLowerCase().trim(), hash, restaurantId,
  );

  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(id);
  const token = generateToken(merchant);
  return { merchant: { id: merchant.id, email: merchant.email, restaurantId: merchant.restaurant_id }, token };
}

function loginMerchant(email, password) {
  const merchant = db.prepare('SELECT * FROM merchants WHERE email = ?').get(email.toLowerCase().trim());
  if (!merchant) return { error: 'Invalid email or password' };
  if (!verifyPassword(password, merchant.password_hash)) return { error: 'Invalid email or password' };

  const token = generateToken(merchant);
  return { merchant: { id: merchant.id, email: merchant.email, restaurantId: merchant.restaurant_id }, token };
}

module.exports = {
  authMiddleware, registerMerchant, loginMerchant, verifyToken,
  customerAuth, optionalCustomerId, registerCustomer, loginCustomer, customerPublic,
};
