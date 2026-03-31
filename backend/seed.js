const db = require('./database');
const { v4: uuidv4 } = require('uuid');

// Clear existing data
db.exec('DELETE FROM menu_items');
db.exec('DELETE FROM restaurants');
db.exec('DELETE FROM categories');

const insertCategory = db.prepare('INSERT INTO categories (id, name, image, icon) VALUES (?, ?, ?, ?)');
const insertRestaurant = db.prepare('INSERT INTO restaurants (id, name, image, cuisine, rating, delivery_time, delivery_fee, min_order, address, description, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertMenuItem = db.prepare('INSERT INTO menu_items (id, restaurant_id, name, description, price, image, category, popular) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

// Categories
const categories = [
  { name: 'Pizza', image: '🍕', icon: 'pizza' },
  { name: 'Burgers', image: '🍔', icon: 'burger' },
  { name: 'Sushi', image: '🍣', icon: 'sushi' },
  { name: 'Chinese', image: '🥡', icon: 'chinese' },
  { name: 'Mexican', image: '🌮', icon: 'mexican' },
  { name: 'Indian', image: '🍛', icon: 'indian' },
  { name: 'Thai', image: '🍜', icon: 'thai' },
  { name: 'Desserts', image: '🍰', icon: 'dessert' },
  { name: 'Healthy', image: '🥗', icon: 'salad' },
  { name: 'Breakfast', image: '🥞', icon: 'breakfast' },
  { name: 'Coffee', image: '☕', icon: 'coffee' },
  { name: 'Wings', image: '🍗', icon: 'wings' },
];

const categoryIds = {};
for (const cat of categories) {
  const id = uuidv4();
  categoryIds[cat.name] = id;
  insertCategory.run(id, cat.name, cat.image, cat.icon);
}

// Restaurants
const restaurants = [
  {
    name: "Mario's Pizzeria",
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
    cuisine: 'Pizza',
    rating: 4.8,
    delivery_time: '25-35 min',
    delivery_fee: 2.99,
    min_order: 12.00,
    address: '123 Main St',
    description: 'Authentic Italian pizza made with fresh ingredients and traditional recipes.',
    featured: 1,
    items: [
      { name: 'Margherita Pizza', description: 'Fresh mozzarella, tomato sauce, basil', price: 14.99, category: 'Pizza', popular: 1 },
      { name: 'Pepperoni Pizza', description: 'Classic pepperoni with mozzarella cheese', price: 16.99, category: 'Pizza', popular: 1 },
      { name: 'BBQ Chicken Pizza', description: 'Grilled chicken, BBQ sauce, red onions, cilantro', price: 17.99, category: 'Pizza', popular: 0 },
      { name: 'Veggie Supreme', description: 'Bell peppers, mushrooms, onions, olives, tomatoes', price: 15.99, category: 'Pizza', popular: 0 },
      { name: 'Garlic Breadsticks', description: 'Fresh baked with garlic butter and parmesan', price: 6.99, category: 'Sides', popular: 1 },
      { name: 'Caesar Salad', description: 'Romaine, croutons, parmesan, Caesar dressing', price: 8.99, category: 'Salads', popular: 0 },
      { name: 'Tiramisu', description: 'Classic Italian dessert with espresso and mascarpone', price: 7.99, category: 'Desserts', popular: 0 },
    ]
  },
  {
    name: "Burger Barn",
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
    cuisine: 'Burgers',
    rating: 4.6,
    delivery_time: '20-30 min',
    delivery_fee: 1.99,
    min_order: 10.00,
    address: '456 Oak Ave',
    description: 'Juicy handcrafted burgers made with 100% Angus beef.',
    featured: 1,
    items: [
      { name: 'Classic Cheeseburger', description: 'Angus beef, cheddar, lettuce, tomato, special sauce', price: 12.99, category: 'Burgers', popular: 1 },
      { name: 'Bacon Smash Burger', description: 'Double patty, crispy bacon, American cheese, pickles', price: 15.99, category: 'Burgers', popular: 1 },
      { name: 'Mushroom Swiss Burger', description: 'Sautéed mushrooms, Swiss cheese, garlic aioli', price: 14.99, category: 'Burgers', popular: 0 },
      { name: 'Crispy Chicken Sandwich', description: 'Fried chicken breast, coleslaw, pickles, spicy mayo', price: 13.99, category: 'Chicken', popular: 1 },
      { name: 'Loaded Fries', description: 'Cheese sauce, bacon bits, green onions, sour cream', price: 8.99, category: 'Sides', popular: 1 },
      { name: 'Onion Rings', description: 'Beer-battered and golden fried', price: 6.99, category: 'Sides', popular: 0 },
      { name: 'Milkshake', description: 'Choose: Vanilla, Chocolate, or Strawberry', price: 5.99, category: 'Drinks', popular: 0 },
    ]
  },
  {
    name: "Sakura Sushi",
    image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800',
    cuisine: 'Sushi',
    rating: 4.9,
    delivery_time: '30-45 min',
    delivery_fee: 3.99,
    min_order: 15.00,
    address: '789 Cherry Blvd',
    description: 'Premium sushi and Japanese cuisine prepared by master chefs.',
    featured: 1,
    items: [
      { name: 'California Roll', description: 'Crab, avocado, cucumber, sesame seeds (8 pcs)', price: 12.99, category: 'Rolls', popular: 1 },
      { name: 'Spicy Tuna Roll', description: 'Fresh tuna, spicy mayo, cucumber (8 pcs)', price: 14.99, category: 'Rolls', popular: 1 },
      { name: 'Dragon Roll', description: 'Eel, avocado, cucumber, unagi sauce (8 pcs)', price: 17.99, category: 'Rolls', popular: 1 },
      { name: 'Salmon Nigiri', description: 'Fresh Atlantic salmon over pressed rice (2 pcs)', price: 6.99, category: 'Nigiri', popular: 0 },
      { name: 'Edamame', description: 'Steamed and salted soybeans', price: 5.99, category: 'Appetizers', popular: 0 },
      { name: 'Miso Soup', description: 'Traditional tofu and seaweed miso soup', price: 3.99, category: 'Soups', popular: 0 },
      { name: 'Tempura Shrimp', description: 'Lightly battered and fried shrimp (6 pcs)', price: 11.99, category: 'Appetizers', popular: 0 },
    ]
  },
  {
    name: "Dragon Palace",
    image: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800',
    cuisine: 'Chinese',
    rating: 4.5,
    delivery_time: '25-40 min',
    delivery_fee: 2.49,
    min_order: 12.00,
    address: '321 Elm St',
    description: 'Traditional Chinese dishes with a modern twist.',
    featured: 0,
    items: [
      { name: 'General Tso Chicken', description: 'Crispy chicken in sweet and spicy sauce with broccoli', price: 13.99, category: 'Entrees', popular: 1 },
      { name: 'Kung Pao Shrimp', description: 'Shrimp with peanuts, peppers, and Sichuan sauce', price: 15.99, category: 'Entrees', popular: 1 },
      { name: 'Beef Lo Mein', description: 'Stir-fried noodles with beef and mixed vegetables', price: 12.99, category: 'Noodles', popular: 1 },
      { name: 'Fried Rice', description: 'Egg fried rice with peas, carrots, and green onions', price: 9.99, category: 'Rice', popular: 0 },
      { name: 'Spring Rolls (4)', description: 'Crispy vegetable spring rolls with sweet chili sauce', price: 6.99, category: 'Appetizers', popular: 0 },
      { name: 'Wonton Soup', description: 'Pork wontons in savory broth with bok choy', price: 7.99, category: 'Soups', popular: 0 },
    ]
  },
  {
    name: "Taco Fiesta",
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800',
    cuisine: 'Mexican',
    rating: 4.7,
    delivery_time: '20-30 min',
    delivery_fee: 1.99,
    min_order: 10.00,
    address: '555 Fiesta Way',
    description: 'Authentic Mexican street food with bold flavors.',
    featured: 1,
    items: [
      { name: 'Street Tacos (3)', description: 'Choice of carne asada, al pastor, or carnitas with cilantro and onion', price: 11.99, category: 'Tacos', popular: 1 },
      { name: 'Loaded Burrito', description: 'Rice, beans, cheese, sour cream, guacamole, and your choice of protein', price: 13.99, category: 'Burritos', popular: 1 },
      { name: 'Quesadilla', description: 'Flour tortilla stuffed with cheese and grilled chicken', price: 10.99, category: 'Quesadillas', popular: 0 },
      { name: 'Chips & Guacamole', description: 'Fresh-made guacamole with crispy tortilla chips', price: 7.99, category: 'Sides', popular: 1 },
      { name: 'Nachos Supreme', description: 'Loaded with beef, cheese, jalapeños, sour cream, pico', price: 12.99, category: 'Sides', popular: 0 },
      { name: 'Churros (3)', description: 'Cinnamon sugar with chocolate dipping sauce', price: 5.99, category: 'Desserts', popular: 0 },
    ]
  },
  {
    name: "Spice Garden",
    image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
    cuisine: 'Indian',
    rating: 4.7,
    delivery_time: '30-45 min',
    delivery_fee: 2.99,
    min_order: 15.00,
    address: '888 Curry Lane',
    description: 'Rich and aromatic Indian cuisine made with authentic spices.',
    featured: 0,
    items: [
      { name: 'Butter Chicken', description: 'Tender chicken in creamy tomato sauce with basmati rice', price: 15.99, category: 'Entrees', popular: 1 },
      { name: 'Lamb Biryani', description: 'Fragrant basmati rice layered with spiced lamb', price: 17.99, category: 'Rice', popular: 1 },
      { name: 'Palak Paneer', description: 'Cottage cheese cubes in spiced spinach gravy', price: 13.99, category: 'Vegetarian', popular: 0 },
      { name: 'Garlic Naan (2)', description: 'Fresh baked naan bread with garlic and butter', price: 4.99, category: 'Bread', popular: 1 },
      { name: 'Samosas (3)', description: 'Crispy pastries filled with spiced potatoes and peas', price: 6.99, category: 'Appetizers', popular: 0 },
      { name: 'Mango Lassi', description: 'Sweet yogurt drink blended with mango', price: 4.99, category: 'Drinks', popular: 0 },
    ]
  },
  {
    name: "Thai Orchid",
    image: 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=800',
    cuisine: 'Thai',
    rating: 4.6,
    delivery_time: '25-40 min',
    delivery_fee: 2.99,
    min_order: 12.00,
    address: '222 Orchid Rd',
    description: 'Authentic Thai flavors from sweet to spicy.',
    featured: 0,
    items: [
      { name: 'Pad Thai', description: 'Rice noodles, shrimp, peanuts, bean sprouts, lime', price: 14.99, category: 'Noodles', popular: 1 },
      { name: 'Green Curry', description: 'Coconut green curry with chicken, bamboo, Thai basil', price: 15.99, category: 'Curries', popular: 1 },
      { name: 'Massaman Curry', description: 'Rich peanut curry with beef, potatoes, onions', price: 16.99, category: 'Curries', popular: 0 },
      { name: 'Tom Yum Soup', description: 'Hot and sour shrimp soup with lemongrass and lime', price: 8.99, category: 'Soups', popular: 1 },
      { name: 'Thai Iced Tea', description: 'Sweet and creamy traditional Thai iced tea', price: 4.99, category: 'Drinks', popular: 0 },
      { name: 'Mango Sticky Rice', description: 'Sweet coconut sticky rice with fresh mango', price: 7.99, category: 'Desserts', popular: 0 },
    ]
  },
  {
    name: "Green Bowl",
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
    cuisine: 'Healthy',
    rating: 4.8,
    delivery_time: '20-30 min',
    delivery_fee: 2.49,
    min_order: 10.00,
    address: '444 Wellness Ave',
    description: 'Fresh, healthy bowls and salads for a balanced lifestyle.',
    featured: 1,
    items: [
      { name: 'Acai Bowl', description: 'Acai blend with granola, banana, berries, honey', price: 12.99, category: 'Bowls', popular: 1 },
      { name: 'Grilled Chicken Bowl', description: 'Brown rice, grilled chicken, avocado, mixed greens, tahini', price: 14.99, category: 'Bowls', popular: 1 },
      { name: 'Salmon Poke Bowl', description: 'Fresh salmon, edamame, cucumber, mango, ponzu', price: 16.99, category: 'Bowls', popular: 1 },
      { name: 'Mediterranean Salad', description: 'Mixed greens, feta, olives, cucumber, tomato, lemon vinaigrette', price: 11.99, category: 'Salads', popular: 0 },
      { name: 'Green Smoothie', description: 'Spinach, banana, mango, almond milk', price: 7.99, category: 'Smoothies', popular: 0 },
      { name: 'Avocado Toast', description: 'Multigrain bread, smashed avocado, cherry tomatoes, everything seasoning', price: 9.99, category: 'Toasts', popular: 0 },
    ]
  },
];

const insertRestaurants = db.transaction(() => {
  for (const r of restaurants) {
    const restaurantId = uuidv4();
    insertRestaurant.run(
      restaurantId, r.name, r.image, r.cuisine, r.rating,
      r.delivery_time, r.delivery_fee, r.min_order, r.address,
      r.description, r.featured
    );
    for (const item of r.items) {
      insertMenuItem.run(
        uuidv4(), restaurantId, item.name, item.description,
        item.price, item.image || null, item.category, item.popular
      );
    }
  }
});

insertRestaurants();
console.log('Database seeded successfully!');
console.log(`  - ${categories.length} categories`);
console.log(`  - ${restaurants.length} restaurants`);
console.log(`  - ${restaurants.reduce((sum, r) => sum + r.items.length, 0)} menu items`);
