// Payment processing via Stripe.
// Set env var: STRIPE_SECRET_KEY
// If missing, falls back to simulated payments (dev mode).

let stripe = null;

try {
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch {}

async function createPaymentIntent(amountDollars, metadata = {}) {
  const amountCents = Math.round(amountDollars * 100);

  if (!stripe) {
    console.log(`[PAYMENT-DEV] Simulated payment: $${amountDollars.toFixed(2)}`);
    return {
      success: true,
      dev: true,
      paymentIntentId: `dev_pi_${Date.now()}`,
      clientSecret: `dev_secret_${Date.now()}`,
      amount: amountCents,
    };
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
    });
    return {
      success: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount: intent.amount,
    };
  } catch (err) {
    console.error('[PAYMENT] Error:', err.message);
    return { success: false, error: err.message };
  }
}

async function confirmPayment(paymentIntentId) {
  if (!stripe || paymentIntentId.startsWith('dev_')) {
    console.log(`[PAYMENT-DEV] Confirmed: ${paymentIntentId}`);
    return { success: true, dev: true, status: 'succeeded' };
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return { success: true, status: intent.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { createPaymentIntent, confirmPayment };
