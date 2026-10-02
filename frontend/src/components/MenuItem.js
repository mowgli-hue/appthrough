import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';

// Items can have size/portion options (Regular/Large, Half/Full plate).
// Tapping + on an item with options opens a premium bottom-sheet picker.
// Option picks become distinct cart lines: "Adrak Chai (Large)".
function MenuItem({ item, restaurant }) {
  const { addItem, removeItem, cart } = useCart();
  const [pop, setPop] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(1);

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

  const openSheet = () => { setSelected(0); setQty(1); setClosing(false); setSheetOpen(true); };
  const closeSheet = () => { setClosing(true); setTimeout(() => { setSheetOpen(false); setClosing(false); }, 220); };

  useEffect(() => {
    if (!sheetOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [sheetOpen]);

  const confirmAdd = () => {
    const opt = options[selected];
    for (let i = 0; i < qty; i++) {
      addItem({ ...item, id: variantId(opt), name: `${item.name} (${opt.name})`, price: opt.price }, restaurant);
    }
    bump();
    closeSheet();
  };

  const fromPrice = hasOptions ? Math.min(...options.map(o => o.price)) : item.price;
  const priceLabel = hasOptions
    ? `From $${fromPrice.toFixed(2)}`
    : `$${item.price.toFixed(2)}`;
  const sheetTotal = hasOptions && sheetOpen ? (options[selected].price * qty) : 0;

  const actionControl = hasOptions ? (
    <button
      className={`add-btn ${pop ? 'pop' : ''}`}
      onClick={openSheet}
      aria-label={`Choose size for ${item.name}`}
    >
      {totalInCart > 0 ? totalInCart : '+'}
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
  );

  return (
    <div className={`menu-item mi-pro ${totalInCart ? 'menu-item-selected' : ''}`}>
      <div className="menu-item-info">
        <div className="menu-item-header">
          <h4>{item.name}{item.popular === 1 && <span className="popular-badge">Popular</span>}</h4>
        </div>
        {item.description && <p className="menu-item-description">{item.description}</p>}
        <p className="menu-item-price">
          {priceLabel}
          {hasOptions && <span className="size-hint">{options.map(o => o.name).join(' / ')}</span>}
        </p>
      </div>
      {item.image ? (
        <div className="menu-item-media">
          <img className="menu-item-photo" src={item.image} alt={item.name} loading="lazy" />
          <div className="menu-item-float">{actionControl}</div>
        </div>
      ) : (
        <div className="menu-item-action">{actionControl}</div>
      )}

      {hasOptions && sheetOpen && (
        <div className={`sheet-overlay ${closing ? 'sheet-closing' : ''}`} onClick={closeSheet}>
          <div className="option-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-grabber" />
            <div className="sheet-head">
              {item.image && <img className="sheet-thumb" src={item.image} alt="" />}
              <div>
                <h3 className="sheet-title">{item.name}</h3>
                <p className="sheet-sub">Choose your size</p>
              </div>
              <button className="sheet-close" onClick={closeSheet} aria-label="Close">×</button>
            </div>

            <div className="sheet-options" role="radiogroup" aria-label="Size">
              {options.map((opt, i) => (
                <button
                  key={opt.name}
                  className={`sheet-option ${i === selected ? 'chosen' : ''}`}
                  onClick={() => setSelected(i)}
                  role="radio"
                  aria-checked={i === selected}
                >
                  <span className={`radio-dot ${i === selected ? 'on' : ''}`} />
                  <span className="sheet-option-name">{opt.name}</span>
                  <span className="sheet-option-price">${opt.price.toFixed(2)}</span>
                </button>
              ))}
            </div>

            <div className="sheet-footer">
              <div className="sheet-stepper">
                <button className="stepper-btn" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Less">−</button>
                <span className="stepper-qty">{qty}</span>
                <button className="stepper-btn stepper-add" onClick={() => setQty(q => Math.min(20, q + 1))} aria-label="More">+</button>
              </div>
              <button className="sheet-add-btn" onClick={confirmAdd}>
                Add to cart · ${sheetTotal.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MenuItem;
