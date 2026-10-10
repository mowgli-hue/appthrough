// Clover POS integration — pushes paid App-Thru orders into each location's
// Clover merchant account so they appear in the Orders app, print a ticket,
// and are counted in Clover sales reports.
//
// Config (Railway env vars), one pair per location:
//   CLOVER_MID_KINGGEORGE / CLOVER_TOKEN_KINGGEORGE
//   CLOVER_MID_DELTA      / CLOVER_TOKEN_DELTA
//   CLOVER_MID_WHITEROCK  / CLOVER_TOKEN_WHITEROCK
// Optional: CLOVER_API_BASE (default https://api.clover.com)
// Optional: CLOVER_PRINT=0 to disable auto-print events.

const API_BASE = process.env.CLOVER_API_BASE || 'https://api.clover.com';
const PRINT = process.env.CLOVER_PRINT !== '0';

// Each restaurant stores its own Clover merchant ID + API token (set in the
// merchant dashboard). Older setups that used Railway env vars still work.
function credsFor(restaurant) {
  if (restaurant && restaurant.clover_mid && restaurant.clover_token) {
    return { mid: restaurant.clover_mid, token: restaurant.clover_token, key: restaurant.name || restaurant.id };
  }
  return legacyEnvCreds(restaurant && restaurant.name);
}

function legacyEnvCreds(restaurantName) {
  const n = String(restaurantName || '').toLowerCase();
  const map = (process.env.CLOVER_LEGACY_KEYS || 'WHITEROCK:white rock|whiterock|marine;DELTA:delta|scott|120 st;KINGGEORGE:king george|kinggeorge|surrey')
    .split(';').map(s => s.split(':')).filter(p => p.length === 2);
  for (const [key, words] of map) {
    if (words.split('|').some(w => w && n.includes(w))) {
      const mid = process.env['CLOVER_MID_' + key];
      const token = process.env['CLOVER_TOKEN_' + key];
      if (mid && token) return { mid, token, key };
    }
  }
  return null;
}

async function cv(creds, method, path, body) {
  const res = await fetch(`${API_BASE}/v3/merchants/${creds.mid}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Clover ${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Cache the "External payment" tender id per merchant
const tenderCache = {};
async function externalTender(creds) {
  if (tenderCache[creds.mid]) return tenderCache[creds.mid];
  const data = await cv(creds, 'GET', '/tenders');
  const list = (data && data.elements) || [];
  const ext = list.find(t => /external/i.test(t.labelKey || '') || /external/i.test(t.label || ''))
    || list.find(t => t.editable === false && /other/i.test(t.label || ''));
  if (ext) tenderCache[creds.mid] = ext.id;
  return ext ? ext.id : null;
}

const cents = (x) => Math.round(Number(x || 0) * 100);

/**
 * Push a paid App-Thru order into Clover. Never throws — logs and returns
 * false on any failure so the customer flow is unaffected.
 * order: { pickup_code, items:[{name,quantity,price}], subtotal, tax,
 *          service_fee, total, customer_name, note, restaurant_name }
 */
async function pushOrder(order) {
  let restaurant = null;
  try {
    const db = require('./database');
    restaurant = order.restaurant_id ? db.prepare('SELECT * FROM restaurants WHERE id = ?').get(order.restaurant_id) : null;
  } catch {}
  const creds = credsFor(restaurant || { name: order.restaurant_name });
  if (!creds) {
    if (process.env.CLOVER_DEBUG) console.log('[clover] no creds for', order.restaurant_name);
    return false;
  }
  try {
    const title = `${order.unpaid ? 'PHONE ' : 'App-Thru '}${order.pickup_code}${order.customer_name ? ' - ' + order.customer_name : ''}${order.unpaid ? ' - PAY AT PICKUP' : ''}`;
    const unpaid = Boolean(order.unpaid);
    const noteParts = [title, unpaid ? 'PHONE ORDER - NOT PAID - take tap payment at pickup' : 'PAID ONLINE (Stripe)'];
    if (order.note) noteParts.push('Note: ' + order.note);
    const cloverOrder = await cv(creds, 'POST', '/orders', {
      state: 'open',
      title,
      note: noteParts.join(' | '),
      manualTransaction: true,
      taxRemoved: true, // our totals already include 5% GST; avoid double tax
    });

    // Line items (custom items: name + price; qty via repeated unitQty)
    const lineItems = [];
    for (const it of order.items || []) {
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      for (let i = 0; i < qty; i++) {
        lineItems.push({ name: String(it.name).slice(0, 127), price: cents(it.price), taxRates: [] });
      }
    }
    if (order.tax > 0) lineItems.push({ name: 'GST 5%', price: cents(order.tax), taxRates: [] });
    if (order.service_fee > 0) lineItems.push({ name: 'App-Thru fee', price: cents(order.service_fee), taxRates: [] });
    await cv(creds, 'POST', `/orders/${cloverOrder.id}/bulk_line_items`, { items: lineItems });

    // Record payment as external tender so Clover shows it paid.
    // Phone orders stay OPEN/unpaid so staff take the card tap on Clover.
    const tenderId = unpaid ? null : await externalTender(creds);
    if (tenderId) {
      await cv(creds, 'POST', `/orders/${cloverOrder.id}/payments`, {
        tender: { id: tenderId },
        amount: cents(order.total),
        offline: false,
      });
    }

    // Fire the order to the printer
    if (PRINT) {
      await cv(creds, 'POST', '/print_event', { orderRef: { id: cloverOrder.id } }).catch(err =>
        console.warn('[clover] print failed:', err.message));
    }

    console.log(`[clover] pushed order ${order.pickup_code} -> ${creds.key} (${cloverOrder.id})`);
    return cloverOrder.id;
  } catch (err) {
    console.error('[clover] push failed for', order.pickup_code, '-', err.message);
    return false;
  }
}

// A phone order that was pushed unpaid got paid online (text link):
// record the payment on the open Clover order so staff don't charge twice.
async function markOrderPaid(restaurant, cloverOrderId, totalDollars, pickupCode) {
  const creds = credsFor(restaurant);
  if (!creds || !cloverOrderId) return false;
  try {
    const tenderId = await externalTender(creds);
    if (!tenderId) return false;
    await cv(creds, 'POST', `/orders/${cloverOrderId}/payments`, { tender: { id: tenderId }, amount: cents(totalDollars), offline: false });
    await cv(creds, 'POST', `/orders/${cloverOrderId}`, { note: `PHONE ${pickupCode || ''} - PAID ONLINE by text link (Stripe)` }).catch(() => {});
    console.log(`[clover] marked phone order ${pickupCode} paid (${cloverOrderId})`);
    return true;
  } catch (err) {
    console.error('[clover] mark paid failed for', pickupCode, '-', err.message);
    return false;
  }
}

// Test one restaurant's Clover connection with a harmless read
async function testConnection(restaurant) {
  const creds = credsFor(restaurant);
  if (!creds) return { ok: false, message: 'Not connected — add your Clover Merchant ID and API token.' };
  try {
    const res = await fetch(`${API_BASE}/v3/merchants/${creds.mid}`, { headers: { Authorization: `Bearer ${creds.token}` } });
    if (res.ok) {
      const m = await res.json();
      return { ok: true, message: `Connected to "${m.name}"` };
    }
    return { ok: false, message: res.status === 401 ? 'Clover rejected the token (401). Check the Merchant ID and token.' : `Clover error (HTTP ${res.status})` };
  } catch (e) { return { ok: false, message: 'Could not reach Clover: ' + e.message }; }
}

module.exports = { pushOrder, markOrderPaid, credsFor, testConnection };
