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
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="orders-page">
      <h1>Your Orders</h1>

      {orders.length === 0 ? (
        <div className="no-results">
          <span className="no-results-icon">📋</span>
          <h2>No orders yet</h2>
          <p>Orders you place on this phone will appear here</p>
          <Link to="/" className="btn-primary">Browse Restaurants</Link>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => (
            <Link to={`/order/${order.id}`} key={order.id} className="order-card">
              <div className="order-card-header">
                <div>
                  <h3>{order.restaurant_name}</h3>
                  <p className="order-date">
                    {formatDate(order.created_at)}
                  </p>
                </div>
                <span className={`status-badge status-${order.status}`}>{order.status}</span>
              </div>
              <div className="order-card-items">
                {order.items.map((item, i) => (
                  <span key={i}>{item.quantity}x {item.name}{i < order.items.length - 1 ? ', ' : ''}</span>
                ))}
              </div>
              <div className="order-card-total">
                <span>Total: ${order.total.toFixed(2)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Orders;
