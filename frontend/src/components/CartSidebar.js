import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function CartSidebar({ isOpen, onClose }) {
  const { cart, addItem, removeItem, clearCart, subtotal, tax, itemCount } = useCart();
  const navigate = useNavigate();
  const APPTHRU_FEE = 0.99;
  const grandTotal = Math.round((subtotal + tax + APPTHRU_FEE) * 100) / 100;

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  return (
    <>
      <div className={`cart-overlay ${isOpen ? 'active' : ''}`} onClick={onClose} />
      <div className={`cart-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="cart-header">
          <h2>Your Cart</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {itemCount === 0 ? (
          <div className="cart-empty">
            <span className="empty-icon">🛒</span>
            <p>Your cart is empty</p>
            <p className="empty-subtitle">Tap the green + on any item to start your order</p>
          </div>
        ) : (
          <>
            <div className="cart-restaurant">
              <span>📍</span> {cart.restaurantName}
            </div>
            <div className="cart-items">
              {cart.items.map((item) => (
                <div key={item.id} className="cart-item">
                  <div className="cart-item-info">
                    <h4>{item.name}</h4>
                    <p className="cart-item-price">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <div className="cart-item-controls">
                    <button onClick={() => removeItem(item.id)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => addItem(item, { id: cart.restaurantId, name: cart.restaurantName, delivery_fee: cart.deliveryFee })}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
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
                <span>${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="cart-actions">
              <button className="checkout-btn" onClick={handleCheckout}>
                Checkout · ${grandTotal.toFixed(2)} →
              </button>
              <button className="clear-btn" onClick={clearCart}>Clear Cart</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default CartSidebar;
