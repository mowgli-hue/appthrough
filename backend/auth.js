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
  req.merchant = decoded;
  next();
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

module.exports = { authMiddleware, registerMerchant, loginMerchant, verifyToken };
