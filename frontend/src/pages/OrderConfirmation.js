import React, { useState, useEffect, useRef } from 'react';
import { rememberOrder } from '../utils/myOrders';
import { useParams, Link } from 'react-router-dom';

const PICKUP_STEPS = [
  { key: 'preparing', label: 'Preparing your order', icon: '👨‍🍳' },
  { key: 'ready', label: 'Ready for pickup!', icon: '🛎️' },
  { key: 'picked_up', label: 'Picked up', icon: '✅' },
];

function OrderConfirmation() {
  const { id } = useParams();
  useEffect(() => { rememberOrder(id); }, [id]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState('');
  const prevStatusRef = useRef(null);

  // Poll for status updates (so the user sees "Ready" the moment staff marks it).
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/orders/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        // Fire notification + chime + vibration when status transitions to "ready".
        if (
          data.order_type !== 'delivery' &&
          prevStatusRef.current &&
          prevStatusRef.current !== 'ready' &&
          data.status === 'ready'
        ) {
          // Audio chime (Web Audio API — no file needed)
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const playTone = (freq, start, dur) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
              osc.connect(gain).connect(ctx.destination);
              osc.start(ctx.currentTime + start);
              osc.stop(ctx.currentTime + start + dur);
            };
            playTone(523, 0, 0.15);    // C5
            playTone(659, 0.15, 0.15); // E5
            playTone(784, 0.3, 0.3);   // G5
          } catch {}

          // Vibrate (mobile)
          try {
            navigator.vibrate?.([200, 100, 200, 100, 400]);
          } catch {}

          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('Your order is ready! 🛎️', {
                body: `${data.restaurant_name} — walk up and show code ${data.pickup_code}`,
                tag: `order-${data.id}`,
              });
            } catch {}
          }
        }

        prevStatusRef.current = data.status;
        setOrder(data);
        setLoading(false);
      } catch {
        /* network hiccup - keep polling */
      }
    };

    load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  const requestNotifications = async () => {
    if (!('Notification' in window)) return;
    try {
      await Notification.requestPermission();
      // Force re-render by touching state
      setOrder(o => ({ ...o }));
    } catch {}
  };

  if (loading) {
    return <div className="v2"><div className="loading"><div className="spinner"></div></div></div>;
  }

  if (!order) {
    return (
      <div className="v2"><div className="v2-empty">
        <div className="ic">🧾</div><h2>Order not found</h2>
        <p>Check the link in your text message.</p>
        <Link to="/" className="v2-btn">Go home</Link>
      </div></div>
    );
  }

  const isPickup = order.order_type !== 'delivery'; // pickup or dine-in
  const isDineIn = order.order_type === 'dinein';
  const cancelOrder = async () => {
    if (!window.confirm('Cancel this order? Your payment will be refunded in full.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setCancelMsg('Order cancelled. Your refund is on its way (3-5 business days).');
        setOrder(o => ({ ...o, status: 'cancelled' }));
      } else {
        setCancelMsg(data.error || 'Could not cancel — please contact the restaurant.');
      }
    } catch {
      setCancelMsg('Could not cancel — please contact the restaurant.');
    }
    setCancelling(false);
  };

  const currentStepIndex = PICKUP_STEPS.findIndex(s => s.key === order.status);

  const st = order.status;
  const title = st === 'ready' ? "It's ready!"
    : st === 'picked_up' ? 'Enjoy your meal'
    : st === 'cancelled' ? 'Order cancelled'
    : 'Order received';
  const sub = st === 'ready' ? (isDineIn ? 'Come grab it at the counter and show your code.' : `Walk up to ${order.restaurant_name} and show your code.`)
    : st === 'picked_up' ? 'Thanks for ordering with App-Thru.'
    : st === 'cancelled' ? 'Your payment has been refunded in full.'
    : `${order.restaurant_name} is preparing it now. We'll text you when it's ready.`;
  const icon = st === 'ready' ? '🛎️' : st === 'picked_up' ? '✅' : st === 'cancelled' ? '↩︎' : '👨‍🍳';
  const code = String(order.pickup_code || '');
  const [codeA, codeB] = code.includes('-') ? code.split('-') : [code, ''];

  return (
    <div className="v2">
      <div className="v2-track">
        <div className={`v2-status ${st}`}>
          <div className="ic">{icon}</div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>

        {isPickup && code && st !== 'cancelled' && (
          <div className="v2-ticket">
            <div className="lbl">{isDineIn ? 'Dine-in code' : 'Pickup code'}</div>
            <div className="code">{codeB ? <>{codeA}<em>-</em>{codeB}</> : code}</div>
            <div className="hint">Show this at the counter</div>
            <div className="perf" />
            <div className="meta">
              <div><span>Name</span><b>{order.customer_name || 'Guest'}</b></div>
              <div><span>Type</span><b>{isDineIn ? 'Dine-in' : 'Pickup'}</b></div>
              <div><span>Total</span><b>${order.total.toFixed(2)}</b></div>
            </div>
          </div>
        )}

        {order.pay_method === 'cash' && order.payment_status === 'unpaid' && st !== 'cancelled' && (
          <div className="v2-card paylink-due">
            <div><strong>💵 ${Number(order.total).toFixed(2)} cash at pickup</strong><span>Pay at the counter when you collect your order.</span></div>
          </div>
        )}
        {order.source === 'phone' && order.pay_method !== 'cash' && st !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'paid_in_store' && (
          <div className="v2-card paylink-due">
            <div><strong>${Number(order.total).toFixed(2)} due</strong><span>Pay now, or tap your card when you pick up.</span></div>
            <Link className="v2-btn" to={`/pay/${order.id}`}>Pay now</Link>
          </div>
        )}

        {isPickup && st !== 'cancelled' && (
          <div className="v2-card">
            <div className="v2-steps">
              {PICKUP_STEPS.map((step, i) => {
                const done = i <= currentStepIndex;
                const active = i === currentStepIndex;
                return (
                  <div key={step.key} className={`v2-stp ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                    <div className="d">{done && !active ? '✓' : i + 1}</div>
                    <div className="t">{step.key === 'preparing' ? 'Preparing' : step.key === 'ready' ? 'Ready' : 'Picked up'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {order.queue_position > 0 && st === 'preparing' && (
          <div className="v2-card v2-eta">
            <div className="big">{order.estimated_minutes}<span style={{ fontSize: '.9rem' }}> min</span></div>
            <div>
              <strong>Estimated wait</strong>
              <small>{order.queue_position === 1 ? "You're next in line" : `${order.queue_position - 1} order${order.queue_position - 1 === 1 ? '' : 's'} ahead of you`}</small>
            </div>
          </div>
        )}

        {'Notification' in window && Notification.permission === 'default' && st === 'preparing' && (
          <button className="v2-btn ghost block" onClick={requestNotifications}>🔔 Notify me on this device too</button>
        )}

        <div className="v2-card">
          <h2 className="v2-h" style={{ marginBottom: 6 }}>{order.restaurant_name}</h2>
          <div className="v2-items">
            {order.items.map((item, i) => (
              <div key={i} className="v2-item">
                <span className="v2-qty">{item.quantity}</span>
                <span className="nm">{item.name}</span>
                <span className="pr">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="v2-row"><span>Subtotal</span><span>${order.subtotal.toFixed(2)}</span></div>
            <div className="v2-row"><span>GST</span><span>${order.tax.toFixed(2)}</span></div>
            {order.service_fee > 0 && <div className="v2-row"><span>App-Thru fee</span><span>${Number(order.service_fee).toFixed(2)}</span></div>}
            <div className="v2-row total"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
          </div>
        </div>

        <div className="v2-actions">
          {cancelMsg && <p className="v2-msg">{cancelMsg}</p>}
          {order.restaurant_phone && (
            <a className="v2-btn ghost block" href={`tel:${order.restaurant_phone}`}>📞 Call {order.restaurant_name}</a>
          )}
          <Link to="/" className="v2-btn block">Order something else</Link>
          {st === 'preparing' && !cancelMsg && (
            <button className="v2-cancel" onClick={cancelOrder} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel order (within 5 min · full refund)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderConfirmation;
