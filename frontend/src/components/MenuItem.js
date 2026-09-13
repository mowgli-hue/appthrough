import React, { useState } from 'react';
import { useCart } from '../context/CartContext';

function MenuItem({ item, restaurant }) {
  const { addItem, removeItem, cart } = useCart();
  const cartItem = cart.items.find(i => i.id === item.id);
  const [pop, setPop] = useState(false);

  const handleAdd = () => {
    addItem(item, restaurant);
    setPop(true);
    setTimeout(() => setPop(false), 300);
  };

  return (
    <div className={`menu-item ${cartItem ? 'menu-item-selected' : ''}`}>
      {item.image && (
        <img className="menu-item-photo" src={item.image} alt={item.name} loading="lazy" />
      )}
      <div className="menu-item-info">
        <div className="menu-item-header">
          <h4>{item.name}</h4>
          {item.popular === 1 && <span className="popular-badge">Popular</span>}
        </div>
        {item.description && <p className="menu-item-description">{item.description}</p>}
        <p className="menu-item-price">${item.price.toFixed(2)}</p>
      </div>
      <div className="menu-item-action">
        {cartItem ? (
          <div className={`item-stepper ${pop ? 'pop' : ''}`}>
            <button className="stepper-btn" onClick={() => removeItem(item.id)} aria-label="Remove one">−</button>
            <span className="stepper-qty">{cartItem.quantity}</span>
            <button className="stepper-btn stepper-add" onClick={handleAdd} aria-label="Add one">+</button>
          </div>
        ) : (
          <button className={`add-btn ${pop ? 'pop' : ''}`} onClick={handleAdd} aria-label={`Add ${item.name}`}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

export default MenuItem;
