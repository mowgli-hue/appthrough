const db = require('./database');

// --- Utilities -------------------------------------------------------------

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
    const score = Math.max(fuzzyScore(text, r.name), fuzzyScore(text, r.cuisine) * 0.8);
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

// --- Upsell ----------------------------------------------------------------

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
  fries: ['soda', 'milkshake', 'burger', 'nuggets'],
  wings: ['fries', 'soda', 'celery', 'ranch'],
};

function getUpsellSuggestion(addedItemName, restaurantId, currentItemIds) {
  const lower = normalize(addedItemName);
  let candidates = [];
  for (const [keyword, suggestions] of Object.entries(UPSELL_PAIRS)) {
    if (lower.includes(keyword)) { candidates = suggestions; break; }
  }
  if (!candidates.length) return null;
  const menu = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);
  for (const candidate of candidates) {
    const match = menu.find(m => normalize(m.name).includes(candidate) && !currentItemIds.includes(m.id));
    if (match) return match;
  }
  return null;
}

// --- Intent detection ------------------------------------------------------

function detectIntent(text) {
  const t = normalize(text);
  if (!t) return 'empty';
  if (/^(yes|yeah|yep|yup|correct|right|sure|ok|okay|confirm|place|that'?s it|done|finish|i'?m good|that'?s? all|nothing else|checkout|check out)\b/.test(t)) return 'confirm';
  if (/^(no|nope|nah|cancel|stop|wait|not yet|no thanks|i'?m good|never ?mind)\b/.test(t)) return 'deny';
  if (/\b(hi|hello|hey|good|fine|great|doing well|not bad|how are you)\b/.test(t)) return 'greeting_reply';
  if (/\b(add|also|and|plus|more|another|throw in|get me|i'?d like|i want|can i get|let me get|give me|i'?ll have|i'?ll take)\b/.test(t)) return 'add';
  if (/\b(remove|cancel|delete|take off|no more|take away|get rid)\b/.test(t)) return 'remove';
  if (/\b(total|how much|price|cost|what do i owe)\b/.test(t)) return 'total';
  if (/\b(repeat|say again|what did i order|my order|read.?back|what do i have)\b/.test(t)) return 'repeat';
  if (/\b(menu|what do you have|options|what'?s good|recommend|popular|what can i get|what do you serve)\b/.test(t)) return 'menu';
  if (/\b(restart|start over|clear|new order|begin again)\b/.test(t)) return 'restart';
  return 'other';
}

// --- Session management ----------------------------------------------------

const sessions = new Map();
const SESSION_TTL = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session._createdAt > SESSION_TTL) sessions.delete(id);
  }
}, 5 * 60 * 1000);

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
    greeted: false,
    _createdAt: Date.now(),
  };
  if (opts.restaurantId) {
    const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(opts.restaurantId);
    if (r) {
      session.restaurant = r;
      session.kioskMode = true;
    }
  }
  return session;
}

function getSession(id, opts) {
  if (!sessions.has(id)) sessions.set(id, newSession(opts));
  return sessions.get(id);
}

// --- Natural response helpers ----------------------------------------------

function summarize(session) {
  const subtotal = session.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}

function readBackOrder(session) {
  if (!session.items.length) return "You don't have anything in your order yet.";
  const parts = session.items.map(i => {
    const name = i.quantity > 1 ? `${i.quantity} ${i.name}s` : `a ${i.name}`;
    return name;
  });
  const { total } = summarize(session);
  if (parts.length === 1) return `You've got ${parts[0]}, coming to $${total.toFixed(2)}.`;
  const last = parts.pop();
  return `You've got ${parts.join(', ')} and ${last}, coming to $${total.toFixed(2)}.`;
}

function anythingElse() {
  return pick([
    "What else can I get you?",
    "Anything else for you today?",
    "Would you like anything else?",
    "Can I get you anything else?",
    "What else sounds good?",
    "Anything else, or are you all set?",
  ]);
}

function gotIt() {
  return pick(["Got it!", "Perfect!", "You got it!", "Awesome!", "Great choice!", "Nice!", "Coming right up!"]);
}

function noWorries() {
  return pick(["No worries!", "No problem!", "All good!", "Sure thing!", "Of course!"]);
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
        reply: `${gotIt()} Added the ${upsell.name}. ${readBackOrder(session)} ${anythingElse()}`,
      };
    }
    return { reply: `${noWorries()} ${readBackOrder(session)} ${anythingElse()}` };
  }

  // Global commands
  if (intent === 'restart') {
    const restaurantId = session.kioskMode ? session.restaurant?.id : null;
    Object.assign(session, newSession(restaurantId ? { restaurantId } : {}));
    if (session.kioskMode) {
      session.stage = 'ordering';
      session.greeted = true;
      return { reply: "Alright, starting fresh! What would you like to order?" };
    }
    session.stage = 'restaurant';
    return { reply: "No problem, let's start over. Which restaurant are you feeling today?" };
  }
  if (intent === 'total' && session.items.length) {
    return { reply: readBackOrder(session) };
  }
  if (intent === 'repeat') {
    return { reply: session.items.length ? readBackOrder(session) : "You haven't ordered anything yet! What sounds good?" };
  }

  switch (session.stage) {
    case 'greeting': {
      if (session.kioskMode) {
        session.stage = 'ordering';
        session.greeted = true;
        const r = session.restaurant;
        const greeting = r.greeting || `Hey there! Welcome to ${r.name}!`;
        const popular = db.prepare('SELECT name FROM menu_items WHERE restaurant_id = ? AND popular = 1 LIMIT 3').all(r.id);
        const suggest = popular.length
          ? ` ${pick(["Our popular items today are", "People are loving", "I'd recommend"])} ${popular.map(p => p.name).join(', ')}.`
          : '';
        return {
          reply: `${greeting} How are you doing today? I'll be taking your order.${suggest} What can I get for you?`,
        };
      }
      session.stage = 'restaurant';
      return {
        reply: "Hey! Welcome to App-Thru! I'm here to help you order. Which restaurant are you feeling today?",
      };
    }

    case 'restaurant': {
      if (intent === 'greeting_reply') {
        return { reply: pick(["Awesome! So which restaurant sounds good today?", "Glad to hear it! What restaurant are you thinking?", "Great! Where would you like to order from?"]) };
      }
      const r = bestMatchRestaurant(userText);
      if (!r) {
        const sample = db.prepare('SELECT name FROM restaurants ORDER BY rating DESC LIMIT 4').all();
        return {
          reply: `Hmm, I didn't quite catch that. We've got ${sample.map(s => s.name).join(', ')}, and a few more. Which one sounds good?`,
        };
      }
      session.restaurant = r;
      session.stage = 'ordering';
      const popular = db.prepare('SELECT name FROM menu_items WHERE restaurant_id = ? AND popular = 1 LIMIT 3').all(r.id);
      const suggest = popular.length
        ? ` ${pick(["Popular picks are", "People love", "I'd recommend"])} ${popular.map(p => p.name).join(', ')}.`
        : '';
      return {
        reply: `${pick(["Great choice!", "Oh nice!", "Good pick!"])} Ordering from ${r.name}.${suggest} What can I get you?`,
      };
    }

    case 'ordering': {
      // Customer just saying hi/greeting
      if (intent === 'greeting_reply' && !session.greeted) {
        session.greeted = true;
        return { reply: pick(["Glad you're doing well! So what can I get started for you?", "Awesome! Alright, what are you in the mood for?", "Great to hear! What sounds good today?"]) };
      }
      if (intent === 'greeting_reply' && session.greeted) {
        return { reply: pick(["So what can I get you?", "Alright, what are you in the mood for?", "What sounds good?"]) };
      }

      if (intent === 'confirm' && session.items.length) {
        session.stage = 'name';
        return { reply: `${pick(["Alright!", "Sounds good!", "Perfect!"])} ${readBackOrder(session)} Can I get a name for the order?` };
      }
      if (intent === 'confirm' && !session.items.length) {
        return { reply: pick(["You haven't ordered anything yet! What would you like?", "Your order's empty so far. What sounds good?", "Let's get some food first! What can I get you?"]) };
      }
      if (intent === 'deny') {
        return { reply: pick(["Sure, take your time! What else would you like?", "No rush! Let me know what you'd like.", "Okay! Anything else you want to add or change?"]) };
      }
      if (intent === 'menu') {
        const items = db.prepare('SELECT name, price FROM menu_items WHERE restaurant_id = ? ORDER BY popular DESC LIMIT 8').all(session.restaurant.id);
        return {
          reply: `Sure! Here's what we've got: ${items.map(i => `${i.name} for $${i.price.toFixed(2)}`).join(', ')}. What catches your eye?`,
        };
      }
      if (intent === 'remove') {
        if (!session.items.length) return { reply: "Your order's empty right now, nothing to remove!" };
        const matches = bestMatchMenuItems(userText, session.restaurant.id, 1);
        if (matches.length) {
          const target = matches[0];
          const idx = session.items.findIndex(i => i.id === target.id);
          if (idx >= 0) {
            session.items.splice(idx, 1);
            return { reply: `Done, took off the ${target.name}. ${session.items.length ? readBackOrder(session) : "Your order's empty now."} ${anythingElse()}` };
          }
        }
        const removed = session.items.pop();
        return {
          reply: removed
            ? `Okay, removed the ${removed.name}. ${session.items.length ? readBackOrder(session) : "Your order's empty now."} ${anythingElse()}`
            : "Hmm, I couldn't find that item on your order.",
        };
      }

      // Default: try to add items
      const matches = bestMatchMenuItems(userText, session.restaurant.id, 1);
      if (!matches.length) {
        return {
          reply: pick([
            "Hmm, I didn't quite catch that. Could you say it again?",
            "Sorry, I'm not sure what that is. You can say 'menu' to hear what we have!",
            "I didn't get that one. Want me to read you the menu?",
            "Could you repeat that? Or say 'what do you have' to hear the options.",
          ]),
        };
      }
      const item = matches[0];
      const qty = parseQuantity(userText);
      const existing = session.items.find(i => i.id === item.id);
      if (existing) existing.quantity += qty;
      else session.items.push({ id: item.id, name: item.name, price: item.price, quantity: qty });

      const currentIds = session.items.map(i => i.id);
      const upsell = getUpsellSuggestion(item.name, session.restaurant.id, currentIds);
      if (upsell) {
        session.pendingUpsell = upsell;
        return {
          reply: `${gotIt()} ${qty > 1 ? qty + ' ' : ''}${item.name}${qty > 1 ? 's' : ''}, $${(item.price * qty).toFixed(2)}. ${pick(["Hey, want to add", "How about", "Can I throw in"])} ${upsell.name} for just $${upsell.price.toFixed(2)}?`,
          upsell: { name: upsell.name, price: upsell.price },
        };
      }

      return {
        reply: `${gotIt()} ${qty > 1 ? qty + ' ' : ''}${item.name}${qty > 1 ? 's' : ''}, $${(item.price * qty).toFixed(2)}. ${anythingElse()} Or just say "that's all" when you're done.`,
      };
    }

    case 'name': {
      const cleaned = userText.replace(/^(my name is|it'?s|this is|i'?m|im|name'?s)\s+/i, '').trim();
      if (!cleaned || cleaned.length < 2) return { reply: pick(["Sorry, what was your name?", "Didn't catch that — what's your name?", "What name should I put on the order?"]) };
      session.name = cleaned.split(/\s+/).slice(0, 3).join(' ');
      session.stage = 'phone';
      return {
        reply: `${pick(["Nice to meet you", "Hey", "Alright"])}, ${session.name}! What's the best phone number to reach you when your food's ready?`,
      };
    }

    case 'phone': {
      const digits = userText.replace(/\D/g, '');
      if (digits.length < 7) {
        return { reply: pick(["I need a phone number so we can text you when it's ready. Could you say it again?", "Didn't quite get that — what's your mobile number?", "I need at least 7 digits. Could you repeat your number?"]) };
      }
      session.phone = digits;
      session.stage = 'confirm';
      const { total } = summarize(session);
      return {
        reply: `Perfect! So just to make sure I got everything right: ${readBackOrder(session)} That's $${total.toFixed(2)} total. Should I go ahead and place this order?`,
      };
    }

    case 'confirm': {
      if (intent === 'confirm') {
        return { reply: '__PLACE_ORDER__' };
      }
      if (intent === 'deny') {
        session.stage = 'ordering';
        return { reply: "No problem! What would you like to change? You can add or remove items." };
      }
      return { reply: "Should I place the order? Just say yes to confirm, or no if you want to make changes." };
    }

    case 'placed': {
      return {
        reply: `Your order's already placed! Your pickup code is ${session.pickupCode}. We'll text you at ${session.phone} when it's ready!`,
      };
    }

    default:
      return { reply: "Sorry, I got a bit confused there. Say 'start over' and we'll begin fresh!" };
  }
}

module.exports = { getSession, handleTurn, summarize, sessions, newSession };
