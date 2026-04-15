import React, { useState, useEffect, useCallback } from 'react';

function KitchenPickup() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pickup-orders');
      const data = await res.json();
      setOrders(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  const updateStatus = async (orderId, status) => {
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="kitchen-page">
      <div className="kitchen-header">
        <h1>🍳 Kitchen — Walk-up Pickup Queue</h1>
        <p>Mark orders as ready to notify the customer on their phone.</p>
      </div>

      {orders.length === 0 ? (
        <div className="no-results">
          <span className="no-results-icon">🧑‍🍳</span>
          <h2>No pickup orders in the queue</h2>
          <p>New walk-up pickup orders will appear here in real time.</p>
        </div>
      ) : (
        <div className="kitchen-grid">
          {orders.map(order => (
            <div key={order.id} className={`kitchen-card status-${order.status}`}>
              <div className="kitchen-card-top">
                <div className="kitchen-code">{order.pickup_code}</div>
                <span className={`status-badge status-${order.status}`}>
                  {order.status}
                </span>
              </div>
              <div className="kitchen-meta">
                <strong>{order.customer_name || 'Guest'}</strong>
                <span>📞 {order.customer_phone}</span>
                <span className="kitchen-restaurant">{order.restaurant_name}</span>
                <span className="kitchen-time">
                  Placed {new Date(order.created_at).toLocaleTimeString()}
                </span>
              </div>
              <ul className="kitchen-items">
                {order.items.map((item, i) => (
                  <li key={i}>
                    <span>{item.quantity}x {item.name}</span>
                  </li>
                ))}
              </ul>
              <div className="kitchen-actions">
                {order.status === 'preparing' && (
                  <button
                    className="btn-primary"
                    onClick={() => updateStatus(order.id, 'ready')}
                  >
                    🛎️ Mark Ready &amp; Notify
                  </button>
                )}
                {order.status === 'ready' && (
                  <button
                    className="btn-secondary"
                    onClick={() => updateStatus(order.id, 'picked_up')}
                  >
                    ✅ Mark Picked Up
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default KitchenPickup;
