import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

function OrderConfirmation() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(data => {
        setOrder(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!order) {
    return <div className="error-page"><h2>Order not found</h2></div>;
  }

  return (
    <div className="order-confirmation">
      <div className="confirmation-card">
        <div className="confirmation-header">
          <span className="confirmation-icon">✅</span>
          <h1>Order Confirmed!</h1>
          <p>Your order has been placed successfully</p>
        </div>

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
            <span>Status</span>
            <span className="status-badge">{order.status}</span>
          </div>
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
            <span>Delivery</span><span>${order.delivery_fee.toFixed(2)}</span>
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
