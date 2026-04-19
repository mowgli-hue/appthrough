const db = require('./database');

// --- Small utilities -------------------------------------------------------

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2,
};

function parseQuantity(text) {
  const digit = text.match(/\b(\d{1,2})\b/);
  if (digit) return parseInt(digit[1], 10);
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return num;
  }
  return 1;
}

function fuzzyScore(needle, haystack) {
  const n = normalize(needle);
  const h = normalize(haystack);
  if (!n || !h) return 0;
  if (h.includes(n)) return n.length / h.length + 0.5;
  const nTokens = n.split(' ');
  const hTokens = new Set(h.split(' '));
  let matched = 0;
  for (const t of nTokens) if (hTokens.has(t)) matched++;
  return matched / nTokens.length;
}

function bestMatchRestaurant(text) {
  const restaurants = db.prepare('SELECT * FROM restaurants').all();
  let best = null;
  let bestScore = 0.35;
  for (const r of restaurants) {
    const score = Math.max(
      fuzzyScore(text, r.name),
      fuzzyScore(text, r.cuisine) * 0.8,
    );
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

function bestMatchMenuItems(text, restaurantId, limit = 3) {
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);
  const scored = items
    .map(item => ({ item, score: fuzzyScore(text, item.name) + fuzzyScore(text, item.category || '') * 0.3 }))
    .filter(s => s.score > 0.25)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

// --- Upsell engine ---------------------------------------------------------

const UPSELL_PAIRS = {
  burger: ['fries', 'onion rings', 'soda', 'milkshake', 'cola'],
  pizza: ['garlic bread', 'wings', 'soda', 'breadsticks'],
  sandwich: ['chips', 'fries', 'soup', 'soda', 'cookie'],
  chicken: ['fries', 'coleslaw', 'soda', 'biscuit', 'mac and cheese'],
  taco: ['chips', 'guacamole', 'salsa', 'soda', 'burrito'],
  salad: ['soup', 'bread', 'water', 'iced tea'],
  pasta: ['garlic bread', 'salad', 'wine', 'tiramisu'],
  sushi: ['edamame', 'miso soup', 'sake', 'gyoza'],
  noodle: ['spring roll', 'dumpling', 'iced tea'],
  rice: ['spring roll', 'soup', 'iced tea'],
  steak: ['fries', 'salad', 'wine', 'mashed potatoes'],
  fish: ['fries', 'coleslaw', 'tartar sauce', 'soda'],
  wrap: ['chips', 'soda', 'cookie', 'soup'],
  coffee: ['muffin', 'croissant', 'cookie', 'scone'],
  tea: ['scone', 'cookie', 'muffin'],
  fries: ['soda', 'milkshake', 'burger', 'nuggets'],
  wings: ['fries', 'soda', 'celery', 'ranch'],
};

function getUpsellSuggestion(addedItemName, restaurantId, currentItemIds) {
  const lower = normalize(addedItemName);
  let candidates = [];
  for (const [keyword, suggestions] of Object.entries(UPSELL_PAIRS)) {
    if (lower.includes(keyword)) {
      candidates = suggestions;
      break;
    }
  }
  if (!candidates.length) return null;

  const menu = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);
  for (const candidate of candidates) {
    const match = menu.find(m =>
      normalize(m.name).includes(candidate) && !currentItemIds.includes(m.id)
    );
    if (match) {
      return match;
    }
  }
  return null;
}

// --- Intent detection ------------------------------------------------------

function detectIntent(text) {
  const t = normalize(text);
  if (!t) return 'empty';
  if (/^(yes|yeah|yep|yup|correct|right|sure|confirm|place(?:\s+it)?|that'?s it|done|finish)\b/.test(t)) return 'confirm';
  if (/^(no|nope|nah|cancel|stop|wait|not yet|no thanks|i m good|im good)\b/.test(t)) return 'deny';
  if (/\b(add|also|and|plus|more|another|throw in|get me)\b/.test(t)) return 'add';
  if (/\b(remove|cancel|delete|take off|no more)\b/.test(t)) return 'remove';
  if (/\b(total|how much|price|cost)\b/.test(t)) return 'total';
  if (/\b(repeat|say again|what did i order|my order)\b/.test(t)) return 'repeat';
  if (/\b(menu|what do you have|options|what's good)\b/.test(t)) return 'menu';
  if (/\b(restart|start over|clear)\b/.test(t)) return 'restart';
  return 'other';
}

// --- Session storage -------------------------------------------------------

const sessions = new Map();

function newSession(opts = {}) {
  const session = {
    stage: 'greeting',
    restaurant: null,
    items: [],
    name: '',
    phone: '',
    orderId: null,
    pickupCode: null,
    kioskMode: false,
    pendingUpsell: null,
  };
  if (opts.restaurantId) {
    const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(opts.restaurantId);
    if (r) {
      session.restaurant = r;
      session.kioskMode = true;
      session.stage = 'greeting';
    }
  }
  return session;
}

function getSession(id, opts) {
  if (!sessions.has(id)) sessions.set(id, newSession(opts));
  return sessions.get(id);
}

// --- Order math ------------------------------------------------------------

function summarize(session) {
  const subtotal = session.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}

function readBackOrder(session) {
  if (!session.items.length) return "Your order is currently empty.";
  const parts = session.items.map(i => `${i.quantity} ${i.name}${i.quantity > 1 ? 's' : ''}`);
  const { total } = summarize(session);
  return `So far I have ${parts.join(', ')}. Your total comes to $${total.toFixed(2)}.`;
}

// --- Core turn handler -----------------------------------------------------

function handleTurn(session, userText) {
  const intent = detectIntent(userText);

  // Handle upsell response
  if (session.pendingUpsell) {
    const upsell = session.pendingUpsell;
    session.pendingUpsell = null;
    if (intent === 'confirm') {
      const existing = session.items.find(i => i.id === upsell.id);
      if (existing) existing.quantity += 1;
      else session.items.push({ id: upsell.id, name: upsell.name, price: upsell.price, quantity: 1 });
      return {
        reply: `Added ${upsell.name} — $${upsell.price.toFixed(2)}. ${readBackOrder(session)} Anything else, or say "that's it" to check out.`,
      };
    }
    return { reply: `No problem! ${readBackOrder(session)} Anything else, or say "that's it" to check out.` };
  }

  // Global commands
  if (intent === 'restart') {
    const restaurantId = session.kioskMode ? session.restaurant?.id : null;
    Object.assign(session, newSession(restaurantId ? { restaurantId } : {}));
    if (session.kioskMode) {
      session.stage = 'ordering';
      const popular = db.prepare('SELECT name FROM menu_items WHERE restaurant_id = ? AND popular = 1 LIMIT 3').all(session.restaurant.id);
      const suggest = popular.length ? ` Popular picks: ${popular.map(p => p.name).join(', ')}.` : '';
      return { reply: `Starting fresh!${suggest} What would you like to order?` };
    }
    session.stage = 'restaurant';
    return { reply: "No problem, starting over. Which restaurant would you like to order from?" };
  }
  if (intent === 'total' && session.items.length) {
    return { reply: readBackOrder(session) };
  }
  if (intent === 'repeat') {
    return { reply: readBackOrder(session) };
  }

  switch (session.stage) {
    case 'greeting': {
      if (session.kioskMode) {
        session.stage = 'ordering';
        const r = session.restaurant;
        const greeting = r.greeting || `Welcome to ${r.name}!`;
        const popular = db.prepare('SELECT name FROM menu_items WHERE restaurant_id = ? AND popular = 1 LIMIT 3').all(r.id);
        const suggest = popular.length ? ` Our popular items today are ${popular.map(p => p.name).join(', ')}.` : '';
        return {
          reply: `${greeting} How are you doing today? I'll be taking your order.${suggest} What can I get for you?`,
        };
      }
      session.stage = 'restaurant';
      return {
        reply: "Hi, welcome to AppThrough! I'm your order assistant. Which restaurant would you like to order from today?",
      };
    }

    case 'restaurant': {
      const r = bestMatchRestaurant(userText);
      if (!r) {
        const sample = db.prepare('SELECT name FROM restaurants ORDER BY rating DESC LIMIT 4').all();
        return {
          reply: "I didn't catch that restaurant. We have " + sample.map(s => s.name).join(', ') + ", and more. Which one sounds good?",
        };
      }
      session.restaurant = r;
      session.stage = 'ordering';
      const popular = db.prepare('SELECT name FROM menu_items WHERE restaurant_id = ? AND popular = 1 LIMIT 3').all(r.id);
      const suggest = popular.length ? ` Popular picks are ${popular.map(p => p.name).join(', ')}.` : '';
      return { reply: `Great choice — ordering from ${r.name}.${suggest} What would you like?` };
    }

    case 'ordering': {
      if (intent === 'confirm' && session.items.length) {
        session.stage = 'name';
        return { reply: `${readBackOrder(session)} Can I grab a name for the order?` };
      }
      if (intent === 'confirm' && !session.items.length) {
        return { reply: "You haven't ordered anything yet. What would you like?" };
      }
      if (intent === 'deny') {
        return { reply: "Okay, anything else you'd like to add or change?" };
      }
      if (intent === 'menu') {
        const items = db.prepare('SELECT name, price FROM menu_items WHERE restaurant_id = ? ORDER BY popular DESC LIMIT 8').all(session.restaurant.id);
        return { reply: `Here's what we have: ${items.map(i => `${i.name} ($${i.price.toFixed(2)})`).join(', ')}. What sounds good?` };
      }
      if (intent === 'remove') {
        if (!session.items.length) return { reply: "Your order is empty right now." };
        const matches = bestMatchMenuItems(userText, session.restaurant.id, 1);
        if (matches.length) {
          const target = matches[0];
          const idx = session.items.findIndex(i => i.id === target.id);
          if (idx >= 0) {
            session.items.splice(idx, 1);
            return { reply: `Removed the ${target.name}. ${readBackOrder(session)} Anything else?` };
          }
        }
        const removed = session.items.pop();
        return {
          reply: removed
            ? `Took off the ${removed.name}. ${readBackOrder(session)} Anything else?`
            : "I couldn't find that item on your order.",
        };
      }

      // Default: try to add items
      const matches = bestMatchMenuItems(userText, session.restaurant.id, 1);
      if (!matches.length) {
        return { reply: "I couldn't quite catch that item. Could you say it again, or ask to hear the menu?" };
      }
      const item = matches[0];
      const qty = parseQuantity(userText);
      const existing = session.items.find(i => i.id === item.id);
      if (existing) existing.quantity += qty;
      else session.items.push({ id: item.id, name: item.name, price: item.price, quantity: qty });

      // Upsell: suggest a complementary item
      const currentIds = session.items.map(i => i.id);
      const upsell = getUpsellSuggestion(item.name, session.restaurant.id, currentIds);
      if (upsell) {
        session.pendingUpsell = upsell;
        return {
          reply: `Added ${qty} ${item.name}${qty > 1 ? 's' : ''} — $${(item.price * qty).toFixed(2)}. Would you like to add ${upsell.name} for just $${upsell.price.toFixed(2)}?`,
          upsell: { name: upsell.name, price: upsell.price },
        };
      }

      return {
        reply: `Added ${qty} ${item.name}${qty > 1 ? 's' : ''} — $${(item.price * qty).toFixed(2)}. Anything else, or say "that's it" to check out.`,
      };
    }

    case 'name': {
      const cleaned = userText.replace(/^(my name is|it'?s|this is|i'?m|im)\s+/i, '').trim();
      if (!cleaned) return { reply: "Sorry, what's your name?" };
      session.name = cleaned.split(/\s+/).slice(0, 3).join(' ');
      session.stage = 'phone';
      return { reply: `Thanks ${session.name}. What's the best mobile number to text you when it's ready?` };
    }

    case 'phone': {
      const digits = userText.replace(/\D/g, '');
      if (digits.length < 7) {
        return { reply: "I need a phone number with at least 7 digits. Could you say it again?" };
      }
      session.phone = digits;
      session.stage = 'confirm';
      const { total } = summarize(session);
      return {
        reply: `Perfect. Just to confirm: ${readBackOrder(session)} That'll be $${total.toFixed(2)} total for walk-up pickup at ${session.restaurant.name}. Should I place the order?`,
      };
    }

    case 'confirm': {
      if (intent === 'confirm') {
        return { reply: '__PLACE_ORDER__' };
      }
      if (intent === 'deny') {
        session.stage = 'ordering';
        return { reply: "No problem — what would you like to change?" };
      }
      return { reply: "Should I place the order? Say yes to confirm, or no to make changes." };
    }

    case 'placed': {
      return {
        reply: `Your order is already placed — pickup code ${session.pickupCode}. We'll notify you when it's ready!`,
      };
    }

    default:
      return { reply: "Sorry, I got confused. Say 'start over' to reset." };
  }
}

module.exports = { getSession, handleTurn, summarize, sessions, newSession };
