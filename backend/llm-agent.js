// LLM-powered cashier: natural, multilingual, menu-aware ordering brain.
// Enabled by ANTHROPIC_API_KEY; the rule-based agent.js remains the fallback.
const db = require('./database');

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const API = 'https://api.anthropic.com/v1/messages';
const MAX_HISTORY = 24;

function available() {
  return Boolean(KEY);
}

function menuLines(restaurantId) {
  const items = db.prepare(
    'SELECT name, price, category, description, popular FROM menu_items WHERE restaurant_id = ? ORDER BY category, name'
  ).all(restaurantId);
  return items.map(i =>
    `- ${i.name} — $${i.price.toFixed(2)} [${i.category}]${i.popular ? ' (popular)' : ''}${i.description ? ` — ${i.description}` : ''}`
  ).join('\n');
}

function systemPrompt(session) {
  let context;
  if (session.restaurant) {
    context = `You are the order-taking cashier at "${session.restaurant.name}" (${session.restaurant.cuisine}).\nTHE MENU:\n${menuLines(session.restaurant.id)}`;
  } else {
    const restaurants = db.prepare('SELECT id, name, cuisine FROM restaurants').all();
    context = 'You take orders for a group of restaurants. THE RESTAURANTS AND MENUS:\n\n' +
      restaurants.map(r => `### ${r.name} (${r.cuisine}) [restaurant_id: ${r.id}]\n${menuLines(r.id)}`).join('\n\n');
  }

  return `You are a warm, quick, natural restaurant cashier taking a spoken walk-up order. Keep replies SHORT (1-2 spoken sentences) — they are read aloud by text-to-speech.

${context}

RULES:
- Speak the customer's language. If they speak Hindi, reply in Hindi; Spanish in Spanish; etc.
- Only offer items that are on the menu. If asked for something not on it, suggest the closest menu item.
- Suggest at most one relevant add-on once (fries with a burger, a snack with chai) — never pushy.
- Take the order, then read the full order back with the total, and ask to confirm.
- After they confirm the items, ask for their first name, then their phone number (for the ready-notification text). Repeat the phone number back to confirm it.
- Only set "confirmed": true once they have confirmed items AND you have their name AND confirmed phone number.
- Prices: use menu prices; 8% tax is added automatically — you can mention "plus tax".

OUTPUT FORMAT — respond with ONLY a JSON object, no other text:
{
  "say": "what you say out loud to the customer, in their language",
  "restaurant_id": "id if known, else null",
  "items": [{"name": "EXACT menu item name in English", "quantity": 1}],
  "customer_name": "name if given, else null",
  "phone": "digits if given, else null",
  "confirmed": false
}
"items" is always the CURRENT COMPLETE order (not a delta).`;
}

function parseJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON in reply');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function matchMenuItem(name, restaurantId) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const target = norm(name);
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId);
  let exact = items.find(i => norm(i.name) === target);
  if (exact) return exact;
  return items.find(i => norm(i.name).includes(target) || target.includes(norm(i.name))) || null;
}

async function turn(session, userText) {
  if (!session.llmHistory) session.llmHistory = [];
  session.llmHistory.push({ role: 'user', content: userText || '(customer walked up)' });
  if (session.llmHistory.length > MAX_HISTORY) {
    session.llmHistory = session.llmHistory.slice(-MAX_HISTORY);
  }
  // History must start with a user turn
  while (session.llmHistory.length && session.llmHistory[0].role !== 'user') session.llmHistory.shift();

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt(session),
      messages: session.llmHistory,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = (data.content || []).map(b => b.text || '').join('');
  session.llmHistory.push({ role: 'assistant', content: raw });

  const out = parseJson(raw);

  // Restaurant selection (multi-restaurant / plaza mode)
  if (!session.restaurant && out.restaurant_id) {
    const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(out.restaurant_id);
    if (r) session.restaurant = r;
  }

  // Sync the structured order into the session (prices from OUR menu, never the model)
  if (session.restaurant && Array.isArray(out.items)) {
    const mapped = [];
    for (const it of out.items) {
      if (!it?.name) continue;
      const row = matchMenuItem(String(it.name), session.restaurant.id);
      if (row) {
        const qty = Math.max(1, Math.min(20, parseInt(it.quantity, 10) || 1));
        mapped.push({ id: row.id, name: row.name, price: row.price, quantity: qty });
      }
    }
    session.items = mapped;
    if (mapped.length) session.stage = 'ordering';
  }

  if (out.customer_name) session.name = String(out.customer_name).slice(0, 60);
  if (out.phone) {
    const digits = String(out.phone).replace(/\D/g, '');
    if (digits.length >= 10) session.phone = digits;
  }

  if (out.confirmed && session.restaurant && session.items.length && session.name && session.phone) {
    return { reply: '__PLACE_ORDER__', spokenConfirmation: out.say };
  }
  return { reply: String(out.say || "Sorry, could you say that again?") };
}

module.exports = { available, turn };
