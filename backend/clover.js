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

function credsFor(restaurantName) {
  const n = String(restaurantName || '').toLowerCase();
  let key = null;
  if (n.includes('white rock') || n.includes('whiterock') || n.includes('marine')) key = 'WHITEROCK';
  else if (n.includes('delta') || n.includes('scott') || n.includes('120 st')) key = 'DELTA';
  else if (n.includes('king george') || n.includes('kinggeorge') || n.includes('surrey')) key = 'KINGGEORGE';
  if (!key) return null;
  const mid = process.env['CLOVER_MID_' + key];
  const token = process.env['CLOVER_TOKEN_' + key];
  if (!mid || !token) return null;
  return { mid, token, key };
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
  const creds = credsFor(order.restaurant_name);
  if (!creds) {
    if (process.env.CLOVER_DEBUG) console.log('[clover] no creds for', order.restaurant_name);
    return false;
  }
  try {
    const title = `App-Thru ${order.pickup_code}${order.customer_name ? ' - ' + order.customer_name : ''}`;
    const noteParts = [title, 'PAID ONLINE (Stripe)'];
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

    // Record payment as external tender so Clover shows it paid
    const tenderId = await externalTender(creds);
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
    return true;
  } catch (err) {
    console.error('[clover] push failed for', order.pickup_code, '-', err.message);
    return false;
  }
}

// Diagnostic: test each configured location's token with a harmless GET
async function testConnections() {
  const keys = ['KINGGEORGE', 'DELTA', 'WHITEROCK'];
  const out = {};
  for (const key of keys) {
    const mid = process.env['CLOVER_MID_' + key];
    const token = process.env['CLOVER_TOKEN_' + key];
    if (!mid || !token) { out[key] = 'not configured'; continue; }
    try {
      const res = await fetch(`${API_BASE}/v3/merchants/${mid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const m = await res.json();
        out[key] = `OK — connected to "${m.name}"`;
      } else {
        out[key] = `FAILED — HTTP ${res.status}${res.status === 401 ? ' (bad token)' : res.status === 403 ? ' (token lacks permission or wrong merchant)' : ''}`;
      }
    } catch (e) { out[key] = 'FAILED — ' + e.message; }
  }
  return out;
}

module.exports = { pushOrder, credsFor, testConnections };
