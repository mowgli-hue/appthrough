import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { rememberOrder } from '../utils/myOrders';

// Customer pays a phone order from the link we texted them.
// Same Stripe Payment Element setup as checkout (cards, Apple Pay, Google Pay, Link).
function PayLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stripeReady, setStripeReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const mountRef = useRef(null);
  const currencyRef = useRef('cad');

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(o => { setOrder(o); setLoading(false); if (o) rememberOrder(o.id); })
      .catch(() => setLoading(false));
  }, [id]);

  const isPaid = order && (order.payment_status === 'paid' || order.payment_status === 'paid_in_store');
  const isClosed = order && ['cancelled', 'picked_up'].includes(order.status);

  useEffect(() => {
    if (!order || isPaid || isClosed) return;
    let cancelled = false;
    fetch('/api/payments/config').then(r => r.json()).then(cfg => {
      if (cancelled || !cfg.enabled || !cfg.publishableKey) return;
      currencyRef.current = (cfg.currency || 'cad').toLowerCase();
      const init = () => {
        if (cancelled || !window.Stripe) return;
        stripeRef.current = window.Stripe(cfg.publishableKey);
        setStripeReady(true);
      };
      if (window.Stripe) init();
      else {
        const sc = document.createElement('script');
        sc.src = 'https://js.stripe.com/v3/';
        sc.onload = init;
        document.head.appendChild(sc);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [order, isPaid, isClosed]);

  useEffect(() => {
    if (!stripeReady || !mountRef.current || !order) return;
    const elements = stripeRef.current.elements({
      mode: 'payment',
      amount: Math.round(Number(order.total) * 100),
      currency: currencyRef.current,
      paymentMethodTypes: ['card', 'link'],
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' }],
      appearance: {
        theme: 'stripe',
        variables: { colorPrimary: '#141414', colorText: '#141414', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSizeBase: '16px', borderRadius: '14px' },
        rules: {
          '.AccordionItem': { border: '1.5px solid #ede7de', boxShadow: 'none' },
          '.AccordionItem--selected': { borderColor: '#141414', backgroundColor: '#fffcf8' },
          '.Input': { boxShadow: 'none', border: '1.5px solid #e2dbd0' },
        },
      },
    });
    const pe = elements.create('payment', {
      layout: { type: 'accordion', defaultCollapsed: true, radios: true, spacedAccordionItems: true },
      fields: { billingDetails: { name: 'never', phone: 'auto', address: 'auto' } },
      terms: { card: 'never' },
    });
    pe.mount(mountRef.current);
    elementsRef.current = elements;
    return () => { pe.destroy(); elementsRef.current = null; };
  }, [stripeReady, order]);

  const pay = async () => {
    setError('');
    if (!elementsRef.current) return;
    setPaying(true);
    try {
      const { error: subErr } = await elementsRef.current.submit();
      if (subErr) throw new Error(subErr.message);
      const r = await fetch('/api/payments/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const p = await r.json();
      if (!r.ok || !p.clientSecret) throw new Error(p.error || 'Could not start payment');
      if (!String(p.clientSecret).startsWith('dev_')) {
        const result = await stripeRef.current.confirmPayment({
          elements: elementsRef.current,
          clientSecret: p.clientSecret,
          confirmParams: {
            return_url: window.location.origin + '/order/' + order.id,
            payment_method_data: { billing_details: { name: order.customer_name || 'Customer' } },
          },
          redirect: 'if_required',
        });
        if (result.error) throw new Error(result.error.message);
      }
      await fetch('/api/payments/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: p.paymentId, paymentIntentId: p.paymentIntentId }),
      });
      navigate(`/order/${order.id}`);
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  if (loading) return <div className="v2"><div className="loading"><div className="spinner"></div></div></div>;
  if (!order) {
    return <div className="v2"><div className="v2-empty"><h2>Order not found</h2><p>Check the link in your text message.</p></div></div>;
  }

  return (
    <div className="v2">
      <div className="paylink">
        <div className="v2-card">
          <p className="paylink-eyebrow">{order.restaurant_name}</p>
          <h1 className="paylink-title">{isPaid ? 'Paid — thank you!' : 'Pay for your order'}</h1>
          <p className="paylink-code">Pickup code <strong>{order.pickup_code}</strong></p>
          <ul className="paylink-items">
            {(order.items || []).map((i, k) => (
              <li key={k}><span>{i.quantity}× {i.name}</span><span>${(i.price * i.quantity).toFixed(2)}</span></li>
            ))}
          </ul>
          <div className="paylink-row"><span>GST 5%</span><span>${Number(order.tax).toFixed(2)}</span></div>
          <div className="paylink-row paylink-total"><span>Total</span><span>${Number(order.total).toFixed(2)}</span></div>
        </div>

        {isPaid || isClosed ? (
          <Link className="v2-btn paylink-btn" to={`/order/${order.id}`}>Track my order</Link>
        ) : (
          <>
            <div className="v2-card paylink-pay">
              {!stripeReady && <p className="paylink-muted">Loading secure payment…</p>}
              <div ref={mountRef} />
            </div>
            {error && <div className="paylink-error">{error}</div>}
            <button className="v2-btn paylink-btn" disabled={!stripeReady || paying} onClick={pay}>
              {paying ? 'Paying…' : `Pay $${Number(order.total).toFixed(2)}`}
            </button>
            <p className="paylink-muted">Prefer to pay in person? Just tap your card when you pick up.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default PayLink;
