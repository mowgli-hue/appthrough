import React, { useState } from 'react';
import { useCart } from '../context/CartContext';

// Items can have size/portion options (Regular/Large, Half/Full plate).
// Option picks become distinct cart lines: "Adrak Chai (Large)".
function MenuItem({ item, restaurant }) {
  const { addItem, removeItem, cart } = useCart();
  const [pop, setPop] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  let options = null;
  try { options = item.options ? JSON.parse(item.options) : null; } catch {}
  const hasOptions = Array.isArray(options) && options.length >= 2;

  const variantId = (opt) => `${item.id}::${opt.name}`;
  const cartItem = cart.items.find(i => i.id === item.id);
  const optionQty = (opt) => cart.items.find(i => i.id === variantId(opt))?.quantity || 0;
  const totalInCart = hasOptions
    ? options.reduce((s, o) => s + optionQty(o), 0)
    : (cartItem?.quantity || 0);

  const bump = () => { setPop(true); setTimeout(() => setPop(false), 300); };

  const addPlain = () => { addItem(item, restaurant); bump(); };
  const addOption = (opt) => {
    addItem({ ...item, id: variantId(opt), name: `${item.name} (${opt.name})`, price: opt.price }, restaurant);
    bump();
  };

  const priceLabel = hasOptions
    ? `${options.map(o => `${o.name} $${o.price.toFixed(2)}`).join(' · ')}`
    : `$${item.price.toFixed(2)}`;

  return (
    <div className={`menu-item ${totalInCart ? 'menu-item-selected' : ''}`}>
      {item.image && (
        <img className="menu-item-photo" src={item.image} alt={item.name} loading="lazy" />
      )}
      <div className="menu-item-info">
        <div className="menu-item-header">
          <h4>{item.name}{item.popular === 1 && <span className="popular-badge">Popular</span>}</h4>
        </div>
        {item.description && <p className="menu-item-description">{item.description}</p>}
        <p className="menu-item-price">{priceLabel}</p>

        {hasOptions && showOptions && (
          <div className="option-rows">
            {options.map(opt => (
              <div key={opt.name} className="option-row">
                <span className="option-name">{opt.name}</span>
                <span className="option-price">${opt.price.toFixed(2)}</span>
                {optionQty(opt) > 0 ? (
                  <div className="item-stepper">
                    <button className="stepper-btn" onClick={() => removeItem(variantId(opt))}>−</button>
                    <span className="stepper-qty">{optionQty(opt)}</span>
                    <button className="stepper-btn stepper-add" onClick={() => addOption(opt)}>+</button>
                  </div>
                ) : (
                  <button className="add-btn add-btn-sm" onClick={() => addOption(opt)}>+</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="menu-item-action">
        {hasOptions ? (
          <button
            className={`add-btn ${pop ? 'pop' : ''} ${showOptions ? 'add-btn-open' : ''}`}
            onClick={() => setShowOptions(v => !v)}
            aria-label={`Choose size for ${item.name}`}
          >
            {totalInCart > 0 ? totalInCart : (showOptions ? '×' : '+')}
          </button>
        ) : cartItem ? (
          <div className={`item-stepper ${pop ? 'pop' : ''}`}>
            <button className="stepper-btn" onClick={() => removeItem(item.id)} aria-label="Remove one">−</button>
            <span className="stepper-qty">{cartItem.quantity}</span>
            <button className="stepper-btn stepper-add" onClick={addPlain} aria-label="Add one">+</button>
          </div>
        ) : (
          <button className={`add-btn ${pop ? 'pop' : ''}`} onClick={addPlain} aria-label={`Add ${item.name}`}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

export default MenuItem;
