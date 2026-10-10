import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { rememberOrder } from '../utils/myOrders';
import { customerHeaders, getCustomer, getCustomerToken } from '../utils/customer';

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
  const [showNote, setShowNote] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  // --- Stripe Payment Element: cards + Apple Pay + Google Pay + Link ---
  const [stripeReady, setStripeReady] = useState(false);
  const [payMethod, setPayMethod] = useState('pickup'); // becomes 'card' when Stripe loads; 'cash' = pay cash at pickup
  const [acceptCash, setAcceptCash] = useState(true);
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
    if (!cart.restaurantId) return;
    fetch(`/api/restaurants/${cart.restaurantId}`).then(r => (r.ok ? r.json() : null))
      .then(r => { if (r) setAcceptCash(r.accept_cash !== 0); }).catch(() => {});
  }, [cart.restaurantId]);

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
    let cancelled = false;
    let pe = null;
    (async () => {
    // Signed-in customers: load their saved cards (falls back silently to normal checkout)
    let customerSessionClientSecret;
    if (getCustomerToken()) {
      try {
        const r = await fetch('/api/payments/customer-session', { method: 'POST', headers: { ...customerHeaders() } });
        const d = r.ok ? await r.json() : {};
        if (d.enabled && d.customerSessionClientSecret) customerSessionClientSecret = d.customerSessionClientSecret;
      } catch {}
    }
    if (cancelled || !payMountRef.current) return;
    const elements = stripeRef.current.elements({
      ...(customerSessionClientSecret ? { customerSessionClientSecret } : {}),
      mode: 'payment',
      amount: amountCents,
      currency: currencyRef.current,
      paymentMethodTypes: ['card', 'link'],
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' }],
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#141414',
          colorText: '#141414',
          colorTextSecondary: '#8a847c',
          colorDanger: '#b42318',
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          fontSizeBase: '16px',
          borderRadius: '14px',
          spacingUnit: '4px',
        },
        rules: {
          '.AccordionItem': { border: '1.5px solid #ede7de', boxShadow: 'none' },
          '.AccordionItem--selected': { borderColor: '#141414', backgroundColor: '#fffcf8' },
          '.Input': { boxShadow: 'none', border: '1.5px solid #e2dbd0' },
          '.Input:focus': { borderColor: '#141414', boxShadow: '0 0 0 3px rgba(20,20,20,.07)' },
          '.Label': { fontWeight: '600' },
        },
      },
    });
    pe = elements.create('payment', {
      // Premium: spaced expandable options with radio dots, minimal questions.
      layout: { type: 'accordion', defaultCollapsed: true, radios: true, spacedAccordionItems: true },
      // We already collect name + phone in our own form; never ask for address.
      fields: { billingDetails: { name: 'never', phone: 'never', address: 'auto' } },
      terms: { card: 'never' },
    });
    pe.mount(payMountRef.current);
    elementsRef.current = elements;
    })();
    return () => { cancelled = true; if (pe) pe.destroy(); elementsRef.current = null; };
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
        pay_method: paying ? 'card' : (f.payMethod === 'cash' ? 'cash' : undefined),
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
      await createOrderAndPay(payingByCard ? elementsRef.current : null, { name, phone, note, orderType, cart, payMethod });
    } catch (e) {
      setError(e.message || 'Failed to place order. Please try again.');
      setPlacing(false);
    }
  };

  const payLabel = placing
    ? 'Placing order…'
    : `${stripeReady && payMethod === 'card' ? 'Pay' : (payMethod === 'cash' ? 'Place order · pay cash at pickup' : 'Place order')} · $${effectiveTotal.toFixed(2)}`;

  return (
    <div className="v2">
      <div className="v2-checkout">
        <div className="v2-head">
          <button className="v2-back" onClick={() => navigate(-1)} aria-label="Back">←</button>
          <div>
            <p className="v2-eyebrow">Checkout</p>
            <h1>{cart.restaurantName}</h1>
          </div>
        </div>

        <section className="v2-card">
          <h2 className="v2-h"><span className="v2-step">1</span> How would you like it?</h2>
          <div className="v2-seg" role="radiogroup" aria-label="Order type">
            <button type="button" role="radio" aria-checked={orderType === 'pickup'} className={orderType === 'pickup' ? 'on' : ''} onClick={() => setOrderType('pickup')}>
              <span className="t">🥡 Pickup</span>
              <span className="s">Walk up and grab it when it's ready</span>
            </button>
            <button type="button" role="radio" aria-checked={orderType === 'dinein'} className={orderType === 'dinein' ? 'on' : ''} onClick={() => setOrderType('dinein')}>
              <span className="t">🍽️ Dine-in</span>
              <span className="s">Enjoy it here at the restaurant</span>
            </button>
          </div>
          {orderType === 'dinein' && (
            <p className="v2-note-hint">Seating is first-come, first-served — a table isn't guaranteed at busy times.</p>
          )}
        </section>

        <section className="v2-card">
          <h2 className="v2-h"><span className="v2-step">2</span> Your details</h2>
          <p className="v2-sub">We'll text you the moment your order is ready.</p>
          <div className="v2-field">
            <label htmlFor="co-name">Name</label>
            <input id="co-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder=" " required />
          </div>
          <div className="v2-field">
            <label htmlFor="co-phone">Mobile number</label>
            <input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder=" " required />
          </div>
          {showNote ? (
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label htmlFor="co-note">Note for the kitchen</label>
              <textarea id="co-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder=" " rows={2} />
            </div>
          ) : (
            <button type="button" className="v2-linkbtn" onClick={() => setShowNote(true)}>+ Add a note for the kitchen</button>
          )}
        </section>

        <section className="v2-card">
          <h2 className="v2-h" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="v2-step">3</span> Your order</span>
            <button type="button" className="v2-linkbtn" onClick={() => navigate(`/restaurant/${cart.restaurantId}`)}>Edit</button>
          </h2>
          <div className="v2-items">
            {cart.items.map(item => (
              <div key={item.id} className="v2-item">
                <span className="v2-qty">{item.quantity}</span>
                <span className="nm">{item.name}</span>
                <span className="pr">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="v2-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="v2-row"><span>GST</span><span>${tax.toFixed(2)}</span></div>
            <div className="v2-row"><span>App-Thru fee</span><span>${APPTHRU_FEE.toFixed(2)}</span></div>
            <div className="v2-row total"><span>Total</span><span>${effectiveTotal.toFixed(2)}</span></div>
          </div>
        </section>

        {stripeReady && (
          <section className="v2-card">
            <h2 className="v2-h"><span className="v2-step">4</span> Payment</h2>
            {acceptCash && (
              <div className="v2-seg v2-payseg" role="radiogroup" aria-label="Payment method">
                <button type="button" role="radio" aria-checked={payMethod === 'card'} className={payMethod === 'card' ? 'on' : ''} onClick={() => setPayMethod('card')}>
                  <span className="t">💳 Pay now</span>
                  <span className="s">Card, Apple Pay, Link</span>
                </button>
                <button type="button" role="radio" aria-checked={payMethod === 'cash'} className={payMethod === 'cash' ? 'on' : ''} onClick={() => setPayMethod('cash')}>
                  <span className="t">💵 Cash at pickup</span>
                  <span className="s">Pay at the counter</span>
                </button>
              </div>
            )}
            {payMethod === 'cash' && (
              <p className="v2-cashnote">Have <strong>${effectiveTotal.toFixed(2)}</strong> ready at pickup. The kitchen starts your order right away.</p>
            )}
            <div style={{ display: payMethod === 'cash' ? 'none' : undefined }}>
            <div className={`express-pay ${expressReady ? 'show' : ''}`}>
              <div ref={expressMountRef} />
              {expressReady && <div className="pay-divider"><span>or pay with card</span></div>}
            </div>
            <div className="v2-tip">
              <span>⚡</span>
              <span>{getCustomerToken()
                ? <><strong>Save your card</strong> with the checkbox below — next time it's one tap.</>
                : <><strong>Tip:</strong> sign in or choose <strong>Link</strong> to save your card for next time.</>}</span>
            </div>
            <div className="card-element-box" ref={payMountRef} />
            <div className="v2-secure">🔒 Payments secured by Stripe · App-Thru never sees your card</div>
            </div>
          </section>
        )}

        {error && <div className="v2-error">{error}</div>}

        <p className="v2-sub" style={{ textAlign: 'center' }}>
          {isPickup
            ? "Walk up when we text you and show your pickup code."
            : "Grab a seat if one's free — we'll text you when your food is ready."}
        </p>
      </div>

      <div className="v2-paybar">
        <div className="v2-paybar-inner">
          <div className="sum"><small>Total</small><strong>${effectiveTotal.toFixed(2)}</strong></div>
          <button className="v2-btn" onClick={handlePlaceOrder} disabled={placing}>{payLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
