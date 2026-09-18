// New-order email alerts via Resend (https://resend.com).
// Configure with env vars; disabled gracefully when unset:
//   RESEND_API_KEY  - required to enable
//   RESEND_FROM     - optional, e.g. 'The Chai Bar Orders <orders@appthru.ca>'
const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.RESEND_FROM || 'App-Thru Orders <orders@appthru.ca>';

function available() {
  return Boolean(KEY);
}

async function sendEmail(to, subject, html) {
  if (!KEY) {
    console.log(`[EMAIL-DEV] To: ${to} | ${subject}`);
    return { sent: false, dev: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[EMAIL] Failed to ${to}: ${res.status} ${detail.slice(0, 200)}`);
      return { sent: false };
    }
    const data = await res.json();
    console.log(`[EMAIL] Sent to ${to}: ${data.id}`);
    return { sent: true, id: data.id };
  } catch (err) {
    console.error(`[EMAIL] Error to ${to}:`, err.message);
    return { sent: false };
  }
}

// New-order alert for the restaurant
async function notifyRestaurantNewOrder(order, toEmail, locationName) {
  if (!toEmail) return;
  const items = (typeof order.items === 'string' ? JSON.parse(order.items) : order.items)
    .map(i => `<li>${i.quantity}× ${i.name}</li>`)
    .join('');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px">
      <h2 style="color:#00994f;margin:0 0 4px">🔔 New order — ${locationName || ''}</h2>
      <p style="font-size:28px;font-weight:800;letter-spacing:3px;margin:8px 0">${order.pickup_code || ''}</p>
      <p><strong>${order.customer_name || 'Guest'}</strong>${order.customer_phone ? ' · ' + order.customer_phone : ''}</p>
      ${order.note ? `<p style="background:#fff8e6;border:1px solid #f0d48a;border-radius:8px;padding:8px 12px">📝 <strong>${order.note}</strong></p>` : ''}
      <ul style="font-size:15px">${items}</ul>
      <p style="font-size:18px"><strong>Total: $${Number(order.total).toFixed(2)}</strong></p>
      <p style="color:#888;font-size:12px">Open the kitchen screen to mark it ready: https://www.appthru.ca/kitchen</p>
    </div>`;
  await sendEmail(toEmail, `🔔 New order ${order.pickup_code || ''} — ${locationName || 'App-Thru'}`, html);
}

module.exports = { available, sendEmail, notifyRestaurantNewOrder };
