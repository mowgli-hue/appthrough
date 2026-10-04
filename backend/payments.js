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

const CURRENCY = (process.env.CURRENCY || 'usd').toLowerCase();

function isConfigured() {
  return Boolean(stripe);
}

function publishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}

async function createPaymentIntent(amountDollars, metadata = {}, methodType = 'card', description = '', opts = {}) {
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
    const params = {
      amount: amountCents,
      currency: CURRENCY,
      metadata,
      capture_method: 'automatic',
    };
    if (description) params.description = description;
    if (opts.customer) params.customer = opts.customer; // lets signed-in customers save / reuse cards
    if (methodType === 'card_present') {
      params.payment_method_types = ['card_present']; // physical terminals
    } else {
      // Online: cards (incl. Apple Pay / Google Pay wallets) + Link.
      // Must match the Payment Element's paymentMethodTypes exactly.
      params.payment_method_types = ['card', 'link'];
    }
    const intent = await stripe.paymentIntents.create(params);
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

// Full refund for a cancelled order (customer-initiated within the window)
async function refundPayment(paymentIntentId) {
  if (!isConfigured() || !paymentIntentId || String(paymentIntentId).startsWith('dev_')) {
    return { success: true, dev: true };
  }
  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { success: true, refundId: refund.id, status: refund.status };
  } catch (err) {
    console.error('[PAYMENT] Refund error:', err.message);
    return { success: false, error: err.message };
  }
}

// ---- Saved cards (signed-in customers) --------------------------------
const savedCardsEnabled = () => Boolean(stripe) && process.env.SAVED_CARDS === '1';

async function ensureStripeCustomer(c) {
  if (!stripe) return null;
  if (c.stripe_customer_id) return c.stripe_customer_id;
  const sc = await stripe.customers.create({
    name: c.name || undefined,
    email: c.email && !/@users\.appthru\.ca$/.test(c.email) ? c.email : undefined,
    phone: c.phone ? '+1' + String(c.phone).replace(/\D/g, '').slice(-10) : undefined,
    metadata: { appthru_customer_id: c.id },
  });
  return sc.id;
}

// Short-lived secret that lets the Payment Element show + save this customer's cards
async function createCustomerSession(stripeCustomerId) {
  const cs = await stripe.customerSessions.create({
    customer: stripeCustomerId,
    components: {
      payment_element: {
        enabled: true,
        features: {
          payment_method_redisplay: 'enabled',
          payment_method_save: 'enabled',
          payment_method_save_usage: 'on_session',
          payment_method_remove: 'enabled',
        },
      },
    },
  });
  return cs.client_secret;
}

// Account deletion: removing the Stripe Customer also detaches its saved cards.
async function deleteStripeCustomer(stripeCustomerId) {
  if (!stripe || !stripeCustomerId) return;
  try { await stripe.customers.del(stripeCustomerId); }
  catch (e) { console.error('[stripe] customer delete failed:', e.message); }
}

module.exports = {
  deleteStripeCustomer, savedCardsEnabled, ensureStripeCustomer, createCustomerSession, createPaymentIntent, confirmPayment, refundPayment, isConfigured, publishableKey, CURRENCY };
