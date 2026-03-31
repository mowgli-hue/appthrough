import React from 'react';
import { useCart } from '../context/CartContext';

function MenuItem({ item, restaurant }) {
  const { addItem, cart } = useCart();
  const cartItem = cart.items.find(i => i.id === item.id);

  return (
    <div className="menu-item">
      <div className="menu-item-info">
        <div className="menu-item-header">
          <h4>{item.name}</h4>
          {item.popular === 1 && <span className="popular-badge">Popular</span>}
        </div>
        <p className="menu-item-description">{item.description}</p>
        <p className="menu-item-price">${item.price.toFixed(2)}</p>
      </div>
      <div className="menu-item-action">
        <button
          className={`add-btn ${cartItem ? 'in-cart' : ''}`}
          onClick={() => addItem(item, restaurant)}
        >
          {cartItem ? `${cartItem.quantity} in cart +` : '+'}
        </button>
      </div>
    </div>
  );
}

export default MenuItem;
