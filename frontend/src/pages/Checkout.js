import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function Checkout() {
  const { cart, subtotal, tax, clearCart, itemCount } = useCart();
  const navigate = useNavigate();
  const [orderType, setOrderType] = useState('pickup'); // default to walk-up pickup
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

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

  const isPickup = orderType === 'pickup';
  const effectiveDeliveryFee = isPickup ? 0 : cart.deliveryFee;
  const effectiveTotal = Math.round((subtotal + effectiveDeliveryFee + tax) * 100) / 100;

  const validPhone = (p) => p.replace(/\D/g, '').length >= 7;

  const handlePlaceOrder = async () => {
    setError('');
    if (isPickup) {
      if (!name.trim()) return setError('Please enter your name.');
      if (!validPhone(phone)) return setError('Please enter a valid phone number.');
    } else {
      if (!address.trim()) return setError('Please enter a delivery address.');
    }

    setPlacing(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: cart.restaurantId,
          items: cart.items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
          order_type: orderType,
          delivery_address: isPickup ? '' : address,
          customer_name: name,
          customer_phone: phone,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to place order');
      }
      const order = await res.json();

      // Ask for notification permission up front so we can ping them when ready.
      if (isPickup && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }

      clearCart();
      navigate(`/order/${order.id}`);
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
            <h2>How do you want your order?</h2>
            <div className="order-type-toggle">
              <button
                type="button"
                className={`order-type-option ${isPickup ? 'active' : ''}`}
                onClick={() => setOrderType('pickup')}
              >
                <span className="ot-icon">🚶</span>
                <div className="ot-label">
                  <strong>Walk-up Pickup</strong>
                  <small>No delivery fee · Get notified when ready</small>
                </div>
              </button>
              <button
                type="button"
                className={`order-type-option ${!isPickup ? 'active' : ''}`}
                onClick={() => setOrderType('delivery')}
              >
                <span className="ot-icon">🛵</span>
                <div className="ot-label">
                  <strong>Delivery</strong>
                  <small>Bring it to your door · ${cart.deliveryFee.toFixed(2)} fee</small>
                </div>
              </button>
            </div>
          </div>

          {isPickup ? (
            <div className="checkout-section">
              <h2>Your Info</h2>
              <p className="section-hint">
                We'll text &amp; notify you on your phone when your order is ready to pick up.
              </p>
              <input
                type="text"
                className="address-input"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="tel"
                className="address-input"
                placeholder="Mobile phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ marginTop: '0.5rem' }}
              />
            </div>
          ) : (
            <div className="checkout-section">
              <h2>Delivery Address</h2>
              <input
                type="text"
                className="address-input"
                placeholder="Enter your delivery address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          )}

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
            <div className="summary-row">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>{isPickup ? 'Pickup' : 'Delivery'} Fee</span>
              <span>{isPickup ? 'FREE' : `$${cart.deliveryFee.toFixed(2)}`}</span>
            </div>
            <div className="summary-row">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
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
                : `${isPickup ? 'Place Pickup Order' : 'Place Order'} - $${effectiveTotal.toFixed(2)}`}
            </button>
            {isPickup && (
              <p className="pickup-hint">
                ⏰ You'll get a push notification when your food is ready. Just walk up &amp; show your pickup code.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
