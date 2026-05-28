// SMS notification service via Twilio.
// Set these env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
// If env vars are missing, falls back to console logging (dev mode).

let twilioClient = null;

try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch {}

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

function formatPhone(digits) {
  if (!digits) return null;
  const clean = digits.replace(/\D/g, '');
  if (clean.length === 10) return `+1${clean}`;
  if (clean.length === 11 && clean.startsWith('1')) return `+${clean}`;
  if (clean.startsWith('+')) return clean;
  return `+${clean}`;
}

async function sendSMS(toDigits, message) {
  const to = formatPhone(toDigits);
  if (!to) return { sent: false, reason: 'invalid phone' };

  if (!twilioClient) {
    console.log(`[SMS-DEV] To: ${to} | ${message}`);
    return { sent: true, dev: true };
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: FROM_NUMBER,
      to,
    });
    console.log(`[SMS] Sent to ${to}: ${result.sid}`);
    return { sent: true, sid: result.sid };
  } catch (err) {
    console.error(`[SMS] Failed to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

async function notifyOrderPlaced(order) {
  if (!order.customer_phone) return;
  await sendSMS(
    order.customer_phone,
    `🧾 App-Thru: Hi ${order.customer_name || 'there'}! Your order at ${order.restaurant_name} is confirmed. Pickup code: ${order.pickup_code}. We'll text you when it's ready!`
  );
}

async function notifyOrderReady(order) {
  if (!order.customer_phone) return;
  await sendSMS(
    order.customer_phone,
    `🛎️ App-Thru: Your order is READY! Walk up to ${order.restaurant_name} and show code: ${order.pickup_code}. Enjoy your meal!`
  );
}

async function sendReceipt(order) {
  if (!order.customer_phone) return;
  const items = (typeof order.items === 'string' ? JSON.parse(order.items) : order.items)
    .map(i => `${i.quantity}x ${i.name}`)
    .join(', ');
  await sendSMS(
    order.customer_phone,
    `📋 App-Thru Receipt\n${order.restaurant_name}\n${items}\nTotal: $${order.total.toFixed(2)}\nPickup code: ${order.pickup_code}\nThank you!`
  );
}

module.exports = { sendSMS, notifyOrderPlaced, notifyOrderReady, sendReceipt };
