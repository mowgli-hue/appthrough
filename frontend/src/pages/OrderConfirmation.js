import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

const PICKUP_STEPS = [
  { key: 'preparing', label: 'Preparing your order', icon: '👨‍🍳' },
  { key: 'ready', label: 'Ready for pickup!', icon: '🛎️' },
  { key: 'picked_up', label: 'Picked up', icon: '✅' },
];

function OrderConfirmation() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
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

        // Fire a browser notification when status transitions to "ready".
        if (
          data.order_type === 'pickup' &&
          prevStatusRef.current &&
          prevStatusRef.current !== 'ready' &&
          data.status === 'ready' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification('Your order is ready! 🛎️', {
              body: `${data.restaurant_name} — walk up and show code ${data.pickup_code}`,
              tag: `order-${data.id}`,
            });
          } catch {}
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
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!order) {
    return <div className="error-page"><h2>Order not found</h2></div>;
  }

  const isPickup = order.order_type === 'pickup';
  const currentStepIndex = PICKUP_STEPS.findIndex(s => s.key === order.status);

  return (
    <div className="order-confirmation">
      <div className="confirmation-card">
        {isPickup ? (
          <>
            <div className="confirmation-header pickup-header">
              <span className="confirmation-icon">
                {order.status === 'ready' ? '🛎️' : order.status === 'picked_up' ? '✅' : '🚶'}
              </span>
              <h1>
                {order.status === 'ready'
                  ? 'Your order is ready!'
                  : order.status === 'picked_up'
                  ? 'Thanks for stopping by!'
                  : 'Walk-up Pickup Confirmed'}
              </h1>
              <p>
                {order.status === 'ready'
                  ? `Walk up to ${order.restaurant_name} and show your code.`
                  : order.status === 'picked_up'
                  ? 'Enjoy your meal!'
                  : `We'll notify you on your phone when it's ready at ${order.restaurant_name}.`}
              </p>
            </div>

            <div className="pickup-code-box">
              <div className="pickup-code-label">Your pickup code</div>
              <div className="pickup-code">{order.pickup_code}</div>
              <div className="pickup-code-sub">Show this to the staff when you arrive</div>
            </div>

            {order.queue_position > 0 && (
              <div className="queue-position-box">
                <div className="queue-number">#{order.queue_position}</div>
                <div className="queue-details">
                  <strong>You're #{order.queue_position} in line</strong>
                  <span>~{order.estimated_minutes} min estimated wait</span>
                </div>
              </div>
            )}
            {order.queue_position === 0 && order.status === 'ready' && (
              <div className="queue-position-box queue-ready">
                <div className="queue-number">NOW</div>
                <div className="queue-details">
                  <strong>Your order is ready!</strong>
                  <span>Walk up and grab it</span>
                </div>
              </div>
            )}

            <div className="pickup-progress">
              {PICKUP_STEPS.map((step, i) => {
                const done = i <= currentStepIndex;
                const active = i === currentStepIndex;
                return (
                  <div
                    key={step.key}
                    className={`pickup-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
                  >
                    <div className="pickup-step-dot">{done ? step.icon : i + 1}</div>
                    <div className="pickup-step-label">{step.label}</div>
                  </div>
                );
              })}
            </div>

            {'Notification' in window && Notification.permission === 'default' && (
              <button className="btn-primary" onClick={requestNotifications} style={{ marginBottom: '1rem' }}>
                🔔 Enable phone notifications
              </button>
            )}
            {'Notification' in window && Notification.permission === 'denied' && (
              <p className="pickup-hint">
                Notifications are blocked. Keep this page open — it updates in real time.
              </p>
            )}
          </>
        ) : (
          <div className="confirmation-header">
            <span className="confirmation-icon">✅</span>
            <h1>Order Confirmed!</h1>
            <p>Your order has been placed successfully</p>
          </div>
        )}

        <div className="confirmation-details">
          <div className="detail-row">
            <span>Order ID</span>
            <span className="order-id">{order.id.slice(0, 8)}...</span>
          </div>
          <div className="detail-row">
            <span>Restaurant</span>
            <span>{order.restaurant_name}</span>
          </div>
          <div className="detail-row">
            <span>Type</span>
            <span>{isPickup ? '🚶 Walk-up pickup' : '🛵 Delivery'}</span>
          </div>
          <div className="detail-row">
            <span>Status</span>
            <span className={`status-badge status-${order.status}`}>
              {order.status.replace('_', ' ')}
            </span>
          </div>
          {isPickup && order.customer_phone && (
            <div className="detail-row">
              <span>Notify</span>
              <span>{order.customer_phone}</span>
            </div>
          )}
        </div>

        <div className="confirmation-items">
          <h3>Items Ordered</h3>
          {order.items.map((item, i) => (
            <div key={i} className="confirmation-item">
              <span>{item.quantity}x {item.name}</span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="confirmation-total">
          <div className="summary-row">
            <span>Subtotal</span><span>${order.subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>{isPickup ? 'Pickup' : 'Delivery'}</span>
            <span>{isPickup ? 'FREE' : `$${order.delivery_fee.toFixed(2)}`}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span><span>${order.tax.toFixed(2)}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span><span>${order.total.toFixed(2)}</span>
          </div>
        </div>

        <div className="confirmation-actions">
          <Link to="/orders" className="btn-secondary">View All Orders</Link>
          <Link to="/" className="btn-primary">Order More</Link>
        </div>
      </div>
    </div>
  );
}

export default OrderConfirmation;
