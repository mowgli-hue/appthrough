import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/time';
import { myOrderIds } from '../utils/myOrders';
import { getCustomerToken, customerHeaders } from '../utils/customer';
import { Link } from 'react-router-dom';

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = myOrderIds();
    const device = ids.length
      ? fetch('/api/orders?ids=' + ids.join(',')).then(r => r.json()).catch(() => [])
      : Promise.resolve([]);
    const account = getCustomerToken()
      ? fetch('/api/customers/me/orders', { headers: customerHeaders() }).then(r => (r.ok ? r.json() : [])).catch(() => [])
      : Promise.resolve([]);
    Promise.all([device, account]).then(([a, b]) => {
      const byId = new Map();
      [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(o => byId.set(o.id, { ...byId.get(o.id), ...o }));
      const merged = [...byId.values()].sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
      setOrders(merged);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="v2"><div className="loading"><div className="spinner"></div></div></div>;
  }

  return (
    <div className="v2">
      <div className="v2-orders">
        <p className="v2-eyebrow">History</p>
        <h1>Your orders</h1>
        {orders.length === 0 ? (
          <div className="v2-empty">
            <div className="ic">🧾</div>
            <h2>No orders yet</h2>
            <p>When you order, it'll show up here so you can track it.</p>
            <Link to="/" className="v2-btn">Find something good</Link>
          </div>
        ) : (
          orders.map(order => (
            <Link to={`/order/${order.id}`} key={order.id} className="v2-card v2-ocard">
              <div className="top">
                <div>
                  <h3>{order.restaurant_name}</h3>
                  <div className="when">{formatDate(order.created_at)}</div>
                </div>
                <span className={`v2-st ${order.status}`}>{String(order.status).replace('_', ' ')}</span>
              </div>
              <div className="its">{(order.items || []).map(i => `${i.quantity}× ${i.name}`).join(', ')}</div>
              <div className="bot">
                <span className="code">{order.pickup_code}</span>
                <span>${Number(order.total).toFixed(2)} ›</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default Orders;
