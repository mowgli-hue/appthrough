const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'food_delivery.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    rating REAL DEFAULT 4.5,
    delivery_time TEXT NOT NULL,
    delivery_fee REAL DEFAULT 2.99,
    min_order REAL DEFAULT 10.00,
    address TEXT,
    description TEXT,
    featured INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    icon TEXT
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image TEXT,
    category TEXT,
    popular INTEGER DEFAULT 0,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    items TEXT NOT NULL,
    subtotal REAL NOT NULL,
    delivery_fee REAL NOT NULL,
    tax REAL NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'confirmed',
    delivery_address TEXT,
    order_type TEXT DEFAULT 'delivery',
    pickup_code TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    ready_at DATETIME,
    picked_up_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );
`);

// --- Lightweight migrations for older DBs ---
const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
const addCol = (name, type) => {
  if (!orderCols.includes(name)) {
    db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
  }
};
addCol('order_type', "TEXT DEFAULT 'delivery'");
addCol('pickup_code', 'TEXT');
addCol('customer_name', 'TEXT');
addCol('customer_phone', 'TEXT');
addCol('ready_at', 'DATETIME');
addCol('picked_up_at', 'DATETIME');

// Per-restaurant drive-thru config so any restaurant can onboard.
const restaurantCols = db.prepare('PRAGMA table_info(restaurants)').all().map(c => c.name);
const addRestaurantCol = (name, type) => {
  if (!restaurantCols.includes(name)) {
    db.exec(`ALTER TABLE restaurants ADD COLUMN ${name} ${type}`);
  }
};
addRestaurantCol('greeting', 'TEXT');
addRestaurantCol('supported_languages', "TEXT DEFAULT 'en,es,fr'");
addRestaurantCol('default_language', "TEXT DEFAULT 'en'");
addRestaurantCol('agent_voice', "TEXT DEFAULT 'friendly'");
addRestaurantCol('pickup_instructions', 'TEXT');
addRestaurantCol('drive_thru_enabled', 'INTEGER DEFAULT 1');

// Merchants table for authentication
db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    restaurant_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );
`);

// Payment tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    stripe_payment_intent TEXT,
    amount_cents INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

// Add payment_id to orders
addCol('payment_id', 'TEXT');
addCol('payment_status', "TEXT DEFAULT 'pending'");

module.exports = db;
