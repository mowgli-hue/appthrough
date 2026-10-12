// Monthly settlement statement between App-Thru and one restaurant.
//
// Two kinds of paid orders:
//   ONLINE   (payment_status = 'paid')          -> App-Thru collected the money via Stripe.
//                                                  App-Thru owes the restaurant the food + GST.
//   IN-STORE (payment_status = 'paid_in_store') -> Restaurant collected tap/cash at the counter,
//                                                  including the App-Thru fee. Restaurant owes
//                                                  App-Thru that fee.
// Processor (Stripe) fees are the actual amounts from Stripe, charged to whoever the
// restaurant's `processing_fee_payer` setting says ('appthru' default, or 'restaurant').
// Cancelled/refunded orders are listed but excluded from the settlement.

const db = require('./database');
const payments = require('./payments');

const c = (x) => Math.round(Number(x || 0) * 100); // dollars -> cents
const d = (cents) => Math.round(cents) / 100;      // cents -> dollars

function monthRange(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  const now = new Date();
  const y = m ? parseInt(m[1], 10) : now.getUTCFullYear();
  const mo = m ? parseInt(m[2], 10) : now.getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  const iso = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');
  return { ym: `${y}-${String(mo).padStart(2, '0')}`, start: iso(start), end: iso(end) };
}

// Pull real Stripe fees for payments we haven't checked yet (bounded per call).
async function backfillFees(restaurantId, start, end, limit = 40) {
  const rows = db.prepare(`
    SELECT p.id, p.stripe_payment_intent
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE o.restaurant_id = ? AND o.created_at >= ? AND o.created_at < ?
      AND p.status IN ('succeeded', 'refunded') AND p.stripe_fee_cents IS NULL
      AND p.stripe_payment_intent IS NOT NULL AND p.stripe_payment_intent NOT LIKE 'dev_%'
      AND (p.fee_checked_at IS NULL OR p.fee_checked_at < datetime('now', '-1 hour'))
    LIMIT ?
  `).all(restaurantId, start, end, limit);
  let pending = 0;
  for (const r of rows) {
    const f = await payments.fetchPaymentFees(r.stripe_payment_intent);
    if (f) {
      db.prepare('UPDATE payments SET stripe_fee_cents = ?, stripe_net_cents = ?, refunded_cents = ?, fee_checked_at = datetime(\'now\') WHERE id = ?')
        .run(f.fee, f.net, f.refunded, r.id);
    } else {
      db.prepare('UPDATE payments SET fee_checked_at = datetime(\'now\') WHERE id = ?').run(r.id);
      pending++;
    }
  }
  const stillMissing = db.prepare(`
    SELECT COUNT(*) AS n FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE o.restaurant_id = ? AND o.created_at >= ? AND o.created_at < ?
      AND p.status IN ('succeeded', 'refunded') AND p.stripe_fee_cents IS NULL
      AND p.stripe_payment_intent IS NOT NULL AND p.stripe_payment_intent NOT LIKE 'dev_%'
  `).get(restaurantId, start, end).n;
  return { fetched: rows.length - pending, missing: stillMissing };
}

async function buildStatement(restaurant, ym) {
  const { start, end, ym: month } = monthRange(ym);
  const fees = await backfillFees(restaurant.id, start, end);

  const orders = db.prepare(`
    SELECT o.id, o.created_at, o.pickup_code, o.customer_name, o.status, o.payment_status, o.pay_method, o.source,
           o.subtotal, o.tax, o.service_fee, o.total, o.items,
           p.stripe_fee_cents, p.refunded_cents, p.status AS pstatus
    FROM orders o LEFT JOIN payments p ON p.id = o.payment_id
    WHERE o.restaurant_id = ? AND o.created_at >= ? AND o.created_at < ?
      AND o.status != 'awaiting_payment'
    ORDER BY o.created_at ASC
  `).all(restaurant.id, start, end);

  const feePayer = restaurant.processing_fee_payer === 'restaurant' ? 'restaurant' : 'appthru';
  const S = {
    online: { count: 0, food: 0, gst: 0, appthru_fee: 0, total: 0, stripe_fee: 0, stripe_fee_known: 0 },
    instore: { count: 0, food: 0, gst: 0, appthru_fee: 0, total: 0, cash: 0, tap: 0 },
    unpaid: { count: 0, total: 0 },
    cancelled: { count: 0, total: 0, refunded: 0, stripe_fee: 0 },
  };
  const lines = [];
  for (const o of orders) {
    const food = c(o.subtotal), gst = c(o.tax), fee = c(o.service_fee), total = c(o.total);
    let bucket;
    if (o.status === 'cancelled') {
      bucket = 'cancelled';
      S.cancelled.count++; S.cancelled.total += total;
      S.cancelled.refunded += o.refunded_cents || (o.pstatus === 'refunded' ? total : 0);
      S.cancelled.stripe_fee += o.stripe_fee_cents || 0;
    } else if (o.payment_status === 'paid') {
      bucket = 'online';
      S.online.count++; S.online.food += food; S.online.gst += gst; S.online.appthru_fee += fee; S.online.total += total;
      if (o.stripe_fee_cents != null) { S.online.stripe_fee += o.stripe_fee_cents; S.online.stripe_fee_known++; }
    } else if (o.payment_status === 'paid_in_store') {
      bucket = 'instore';
      S.instore.count++; S.instore.food += food; S.instore.gst += gst; S.instore.appthru_fee += fee; S.instore.total += total;
      if (o.pay_method === 'cash') S.instore.cash += total; else S.instore.tap += total;
    } else {
      bucket = 'unpaid';
      S.unpaid.count++; S.unpaid.total += total;
    }
    let items = '';
    try { items = JSON.parse(o.items).map(i => `${i.quantity}x ${i.name}`).join('; '); } catch {}
    lines.push({
      date: o.created_at, code: o.pickup_code, customer: o.customer_name, bucket,
      status: o.status, payment_status: o.payment_status, pay_method: o.pay_method || (o.payment_status === 'paid' ? 'card' : ''),
      source: o.source || 'app', food: d(food), gst: d(gst), appthru_fee: d(fee), total: d(total),
      stripe_fee: o.stripe_fee_cents != null ? d(o.stripe_fee_cents) : null, items,
    });
  }

  // Settlement
  const stripeTotal = S.online.stripe_fee + S.cancelled.stripe_fee; // Stripe keeps fees on refunds
  const owedToRestaurant = S.online.food + S.online.gst - (feePayer === 'restaurant' ? stripeTotal : 0);
  const owedToAppThru = S.instore.appthru_fee;
  const net = owedToRestaurant - owedToAppThru; // >0: App-Thru pays restaurant; <0: restaurant pays App-Thru
  const appthruRevenue = S.online.appthru_fee + S.instore.appthru_fee;
  const appthruCost = feePayer === 'appthru' ? stripeTotal : 0;

  return {
    restaurant: { id: restaurant.id, name: restaurant.name },
    month, period: { start, end },
    processing_fee_payer: feePayer,
    fees_pending: fees.missing,
    online: { ...S.online, food: d(S.online.food), gst: d(S.online.gst), appthru_fee: d(S.online.appthru_fee), total: d(S.online.total), stripe_fee: d(S.online.stripe_fee) },
    instore: { ...S.instore, food: d(S.instore.food), gst: d(S.instore.gst), appthru_fee: d(S.instore.appthru_fee), total: d(S.instore.total), cash: d(S.instore.cash), tap: d(S.instore.tap) },
    unpaid: { count: S.unpaid.count, total: d(S.unpaid.total) },
    cancelled: { count: S.cancelled.count, total: d(S.cancelled.total), refunded: d(S.cancelled.refunded), stripe_fee: d(S.cancelled.stripe_fee) },
    settlement: {
      owed_to_restaurant: d(owedToRestaurant),
      owed_to_appthru: d(owedToAppThru),
      net: d(net),
      direction: net >= 0 ? 'appthru_pays_restaurant' : 'restaurant_pays_appthru',
      stripe_fees_total: d(stripeTotal),
      stripe_fees_paid_by: feePayer,
    },
    appthru: { revenue: d(appthruRevenue), stripe_cost: d(appthruCost), profit: d(appthruRevenue - appthruCost) },
    orders: lines,
  };
}

function statementCsv(st) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const out = [];
  out.push(['App-Thru settlement statement', st.restaurant.name, st.month].map(esc).join(','));
  out.push('');
  out.push(['Section', 'Orders', 'Food', 'GST', 'App-Thru fee', 'Total', 'Stripe fee'].map(esc).join(','));
  out.push(['Online (App-Thru collected)', st.online.count, st.online.food, st.online.gst, st.online.appthru_fee, st.online.total, st.online.stripe_fee].map(esc).join(','));
  out.push(['In-store (restaurant collected)', st.instore.count, st.instore.food, st.instore.gst, st.instore.appthru_fee, st.instore.total, ''].map(esc).join(','));
  out.push(['Cancelled / refunded (excluded)', st.cancelled.count, '', '', '', st.cancelled.total, st.cancelled.stripe_fee].map(esc).join(','));
  out.push(['Unpaid (not settled yet)', st.unpaid.count, '', '', '', st.unpaid.total, ''].map(esc).join(','));
  out.push('');
  out.push(['Owed to restaurant (online food + GST' + (st.processing_fee_payer === 'restaurant' ? ' - Stripe fees' : '') + ')', st.settlement.owed_to_restaurant].map(esc).join(','));
  out.push(['Owed to App-Thru (fees on in-store orders)', st.settlement.owed_to_appthru].map(esc).join(','));
  out.push(['NET ' + (st.settlement.direction === 'appthru_pays_restaurant' ? 'App-Thru pays restaurant' : 'Restaurant pays App-Thru'), Math.abs(st.settlement.net)].map(esc).join(','));
  out.push(['Stripe fees total (paid by ' + st.settlement.stripe_fees_paid_by + ')', st.settlement.stripe_fees_total].map(esc).join(','));
  out.push('');
  out.push(['date_utc', 'code', 'customer', 'bucket', 'status', 'payment_status', 'pay_method', 'source', 'food', 'gst', 'appthru_fee', 'total', 'stripe_fee', 'items'].map(esc).join(','));
  for (const o of st.orders) {
    out.push([o.date, o.code, o.customer, o.bucket, o.status, o.payment_status, o.pay_method, o.source, o.food, o.gst, o.appthru_fee, o.total, o.stripe_fee ?? '', o.items].map(esc).join(','));
  }
  return out.join('\n');
}

module.exports = { buildStatement, statementCsv, monthRange };
