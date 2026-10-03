import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { rememberOrder } from '../utils/myOrders';
import { customerHeaders, getCustomer } from '../utils/customer';

// Separate Apple Pay button is off: Apple Pay inside the payment list is the
// proven path (see Stripe history). Flip to true only after testing on an iPhone.
const USE_EXPRESS_BUTTON = false;

function Checkout() {
  const { cart, subtotal, tax, clearCart, itemCount } = useCart();
  const navigate = useNavigate();
  // Walk-up pickup or dine-in (table not guaranteed) — no delivery
  const [orderType, setOrderType] = useState('pickup');
  const saved = (() => { try { return { ...JSON.parse(localStorage.getItem('appthru_customer') || '{}'), ...(getCustomer() || {}) }; } catch { return {}; } })();
  const [name, setName] = useState(saved.name || '');
  const [phone, setPhone] = useState(saved.phone || '');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  // --- Stripe Payment Element: cards + Apple Pay + Google Pay + Link ---
  const [stripeReady, setStripeReady] = useState(false);
  const [payMethod, setPayMethod] = useState('pickup'); // becomes 'card' when Stripe loads
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const currencyRef = useRef('cad');
  const payMountRef = useRef(null);
  const expressMountRef = useRef(null);
  const expressElementsRef = useRef(null);
  const [expressReady, setExpressReady] = useState(false);
  const formRef = useRef({});

  const isPickup = orderType === 'pickup';
  const effectiveDeliveryFee = 0;
  const APPTHRU_FEE = 0.99;
  const effectiveTotal = Math.round((subtotal + effectiveDeliveryFee + tax + APPTHRU_FEE) * 100) / 100;
  const amountCents = Math.round(effectiveTotal * 100);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/payments/config')
      .then(r => r.json())
      .then(cfg => {
        if (cancelled || !cfg.enabled || !cfg.publishableKey) return;
        currencyRef.current = (cfg.currency || 'cad').toLowerCase();
        const init = () => {
          if (cancelled || !window.Stripe) return;
          stripeRef.current = window.Stripe(cfg.publishableKey);
          setStripeReady(true);
          setPayMethod('card');
        };
        if (window.Stripe) init();
        else {
          const sc = document.createElement('script');
          sc.src = 'https://js.stripe.com/v3/';
          sc.onload = init;
          document.head.appendChild(sc);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Mount the Payment Element (deferred intent: amount/currency now, intent at submit)
  useEffect(() => {
    if (!stripeReady || !payMountRef.current || amountCents <= 0) return;
    const elements = stripeRef.current.elements({
      mode: 'payment',
      amount: amountCents,
      currency: currencyRef.current,
      paymentMethodTypes: ['card', 'link'],
      appearance: {
        variables: {
          colorPrimary: '#00cc6a',
          borderRadius: '12px',
          fontSizeBase: '16px',
          colorText: '#1a1a1a',
          colorTextSecondary: '#777',
          spacingUnit: '4px',
        },
        rules: {
          '.AccordionItem': { border: '1.5px solid #e8e8e8', boxShadow: 'none' },
          '.AccordionItem--selected': { borderColor: '#0a8a43', backgroundColor: '#f7fdf9' },
          '.Input': { boxShadow: 'none', border: '1.5px solid #e4e4e4' },
          '.Input:focus': { borderColor: '#0a8a43', boxShadow: '0 0 0 3px rgba(10,138,67,.12)' },
        },
      },
    });
    const pe = elements.create('payment', {
      // Premium: spaced expandable options with radio dots, minimal questions.
      layout: { type: 'accordion', defaultCollapsed: true, radios: true, spacedAccordionItems: true },
      // We already collect name + phone in our own form; never ask for address.
      fields: { billingDetails: { name: 'never', phone: 'never', address: 'auto' } },
      terms: { card: 'never' },
    });
    pe.mount(payMountRef.current);
    elementsRef.current = elements;
    return () => { pe.destroy(); elementsRef.current = null; };
  }, [stripeReady]); // amount updates handled separately below

  // Apple Pay / Google Pay: dedicated express button (opens the wallet sheet directly)
  useEffect(() => {
    if (!USE_EXPRESS_BUTTON || !stripeReady || !expressMountRef.current || amountCents <= 0) return;
    const els = stripeRef.current.elements({
      mode: 'payment',
      amount: amountCents,
      currency: currencyRef.current,
      paymentMethodTypes: ['card'],
      appearance: { variables: { borderRadius: '12px' } },
    });
    const ece = els.create('expressCheckout', {
      buttonType: { applePay: 'order', googlePay: 'order' },
      buttonHeight: 50,
      paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
      layout: { maxColumns: 1, maxRows: 2, overflow: 'never' },
    });
    ece.on('ready', ({ availablePaymentMethods }) => {
      setExpressReady(Boolean(availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean)));
    });
    ece.on('click', (event) => {
      const v = validateForm();
      if (v) { setError(v); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      setError('');
      event.resolve();
    });
    ece.on('confirm', async (event) => {
      setPlacing(true);
      try {
        const { error: submitError } = await els.submit();
        if (submitError) throw new Error(submitError.message);
        await createOrderAndPay(els);
      } catch (e) {
        try { event.paymentFailed({ reason: 'fail' }); } catch {}
        setError(e.message || 'Payment failed. Please try again.');
        setPlacing(false);
      }
    });
    ece.mount(expressMountRef.current);
    expressElementsRef.current = els;
    return () => { ece.destroy(); expressElementsRef.current = null; setExpressReady(false); };
  }, [stripeReady]); // eslint-disable-line

  // Keep the sheet amount in sync if the cart total changes
  useEffect(() => {
    if (elementsRef.current && amountCents > 0) {
      elementsRef.current.update({ amount: amountCents });
    }
    if (expressElementsRef.current && amountCents > 0) {
      expressElementsRef.current.update({ amount: amountCents });
    }
  }, [amountCents]);

  if (itemCount === 0) {
    return (
      <div className="checkout-page">
        <div className="checkout-empty">
          <span>🛒</span>
          <h2>Your cart is empty</h2>
          <button onClick={() => navigate('/')}>Browse Restaurants</button>
        </div>
      </div>
    );
  }

  const validPhone = (p) => p.replace(/\D/g, '').length >= 10;

  // Latest form values for the Apple Pay handler (it is registered once)
  formRef.current = { name, phone, note, orderType, cart };

  const validateForm = (f = formRef.current) => {
    if (!f.name.trim()) return 'Please enter your name.';
    if (!validPhone(f.phone)) return 'Please enter a valid 10-digit mobile number — we text you when your order is ready.';
    return '';
  };

  // Creates the order, then (if paying online) charges it with the given Elements group
  const createOrderAndPay = async (payElements, f = formRef.current) => {
    const paying = Boolean(payElements);
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...customerHeaders() },
      body: JSON.stringify({
        restaurant_id: f.cart.restaurantId,
        items: f.cart.items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
        order_type: f.orderType,
        delivery_address: '',
        customer_name: f.name,
        customer_phone: f.phone,
        note: f.note,
        pay_first: paying,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to place order');
    }
    const order = await res.json();
    rememberOrder(order.id);

    if (paying) {
      const payRes = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, amount: order.total }),
      });
      const pay = await payRes.json();
      if (!payRes.ok || !pay.clientSecret) throw new Error(pay.error || 'Could not start payment');

      if (!String(pay.clientSecret).startsWith('dev_')) {
        const result = await stripeRef.current.confirmPayment({
          elements: payElements,
          clientSecret: pay.clientSecret,
          confirmParams: {
            return_url: window.location.origin + '/order/' + order.id,
            payment_method_data: {
              billing_details: { name: f.name.trim(), phone: f.phone.replace(/\D/g, '') },
            },
          },
          redirect: 'if_required',
        });
        if (result.error) throw new Error(result.error.message);
      }
      await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: pay.paymentId, paymentIntentId: pay.paymentIntentId }),
      });
    }

    try { localStorage.setItem('appthru_customer', JSON.stringify({ name: f.name.trim(), phone: f.phone })); } catch {}
    clearCart();
    navigate(`/order/${order.id}`);
  };

  const handlePlaceOrder = async () => {
    setError('');
    const v = validateForm({ name, phone, note, orderType, cart });
    if (v) return setError(v);

    const payingByCard = stripeReady && payMethod === 'card' && Boolean(elementsRef.current);
    if (payingByCard) {
      const { error: submitError } = await elementsRef.current.submit();
      if (submitError) return setError(submitError.message);
    }

    setPlacing(true);
    try {
      await createOrderAndPay(payingByCard ? elementsRef.current : null, { name, phone, note, orderType, cart });
    } catch (e) {
      setError(e.message || 'Failed to place order. Please try again.');
      setPlacing(false);
    }
  };

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-main">
          <h1>Checkout</h1>

          <div className="checkout-section">
            <div className="ordertype-toggle" role="radiogroup" aria-label="Order type">
              <button
                type="button"
                className={`ordertype-btn${orderType === 'pickup' ? ' active' : ''}`}
                onClick={() => setOrderType('pickup')}
              >
                🥡 Pickup
              </button>
              <button
                type="button"
                className={`ordertype-btn${orderType === 'dinein' ? ' active' : ''}`}
                onClick={() => setOrderType('dinein')}
              >
                🍽️ Dine-in
              </button>
            </div>
            {orderType === 'dinein' && (
              <p className="dinein-hint">Seating is first-come, first-served — a table isn't guaranteed at busy times.</p>
            )}
            <h2>Your Info</h2>
            <p className="section-hint">
              Both fields are required — we text your phone the moment your order is ready.
            </p>
            <input
              type="text"
              className="address-input"
              placeholder="Your name *"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="tel"
              className="address-input"
              placeholder="Mobile number *"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ marginTop: '0.5rem' }}
              required
            />
            <textarea
              className="address-input order-note-input"
              placeholder="Note for the kitchen (optional) — e.g. less sugar, no onions, extra spicy"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              rows={2}
              style={{ marginTop: '0.5rem' }}
            />
          </div>

          <div className="checkout-section">
            <h2>Order from {cart.restaurantName}</h2>
            <div className="checkout-items">
              {cart.items.map(item => (
                <div key={item.id} className="checkout-item">
                  <div>
                    <span className="item-qty">{item.quantity}x</span>
                    <span>{item.name}</span>
                  </div>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="checkout-sidebar">
          <div className="order-summary">
            <h2>Order Summary</h2>
            {stripeReady && (
              <div className="pay-method">
                <div className="pay-option selected">💳 Pay — card, Apple Pay, Google Pay</div>
                <div className={`express-pay ${expressReady ? 'show' : ''}`}>
                  <div ref={expressMountRef} />
                  {expressReady && <div className="pay-divider"><span>or pay with card</span></div>}
                </div>
                <div className="link-tip">
                  <span className="link-tip-icon">⚡</span>
                  <span><strong>First time?</strong> Pick <strong>Link</strong> below to save your card securely — next visit it’s one-tap checkout, no typing your card again.</span>
                </div>
                <div className="card-element-box" ref={payMountRef} />
              </div>
            )}
            <div className="summary-row">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>App-Thru Fee</span>
              <span>${APPTHRU_FEE.toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>Total</span>
              <span>${effectiveTotal.toFixed(2)}</span>
            </div>
            {error && <div className="checkout-error">{error}</div>}
            <button
              className="place-order-btn"
              onClick={handlePlaceOrder}
              disabled={placing}
            >
              {placing
                ? 'Placing Order...'
                : `${isPickup ? 'Place Pickup Order' : 'Place Dine-in Order'} - $${effectiveTotal.toFixed(2)}`}
            </button>
            <p className="pickup-hint">
              {isPickup
                ? "⏰ You'll get a text when your food is ready. Just walk up & show your pickup code."
                : "⏰ Order now, grab a seat if one's free — we'll text you when your food is ready."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
