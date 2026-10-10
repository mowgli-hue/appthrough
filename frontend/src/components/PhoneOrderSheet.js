import React, { useState, useEffect, useMemo, useRef } from 'react';
import { authHeaders } from '../utils/auth';

// Staff enter a call-in order. Customer pays by tap at pickup, or by a
// payment link we text them. Prices always come from the server menu.
const TAX = 0.05;

function parseOptions(item) {
  try {
    const o = item.options ? JSON.parse(item.options) : null;
    return Array.isArray(o) && o.length >= 2 ? o : null;
  } catch { return null; }
}

export default function PhoneOrderSheet({ restaurantId, onClose, onCreated }) {
  const [menu, setMenu] = useState([]);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState([]); // { key, menu_item_id, option, name, price, quantity }
  const [sizeFor, setSizeFor] = useState(null); // item awaiting a size choice
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [orderType, setOrderType] = useState('pickup');
  const [payMethod, setPayMethod] = useState('pickup');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [flash, setFlash] = useState('');
  const [step, setStep] = useState('items'); // items -> details
  const orderRef = useRef(null);
  const qtyOf = (itemId) => lines.filter(l => l.menu_item_id === itemId).reduce((n, l) => n + l.quantity, 0);
  const pulse = (txt) => { setFlash(txt); clearTimeout(pulse.t); pulse.t = setTimeout(() => setFlash(''), 1200); };

  useEffect(() => {
    fetch(`/api/merchants/${restaurantId}/menu`, { headers: { ...authHeaders() } })
      .then(r => (r.ok ? r.json() : []))
      .then(list => setMenu(list.filter(i => i.available !== 0)))
      .catch(() => {});
  }, [restaurantId]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? menu.filter(i => `${i.name} ${i.category || ''}`.toLowerCase().includes(q)) : menu;
    return list.reduce((acc, it) => {
      (acc[it.category || 'Other'] = acc[it.category || 'Other'] || []).push(it);
      return acc;
    }, {});
  }, [menu, query]);

  const addLine = (item, opt) => {
    const key = opt ? `${item.id}::${opt.name}` : item.id;
    setLines(prev => {
      const found = prev.find(l => l.key === key);
      if (found) return prev.map(l => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        key, menu_item_id: item.id, option: opt ? opt.name : null,
        name: opt ? `${item.name} (${opt.name})` : item.name,
        price: opt ? Number(opt.price) : Number(item.price), quantity: 1,
      }];
    });
    pulse(`Added ${opt ? `${item.name} (${opt.name})` : item.name}`);
  };
  const tapItem = (item) => {
    const opts = parseOptions(item);
    if (opts) setSizeFor({ item, opts });
    else addLine(item, null);
  };
  const changeQty = (key, d) => setLines(prev => prev
    .map(l => (l.key === key ? { ...l, quantity: l.quantity + d } : l))
    .filter(l => l.quantity > 0));

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const tax = Math.round(subtotal * TAX * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  const submit = async () => {
    setError('');
    if (!lines.length) return setError('Add at least one item');
    if (!name.trim()) return setError("Enter the customer's name");
    if (phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10) return setError('Enter a 10-digit phone number');
    setSaving(true);
    try {
      const r = await fetch(`/api/merchants/${restaurantId}/phone-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          customer_name: name.trim(), customer_phone: phone, note: note.trim(),
          order_type: orderType, pay_method: payMethod,
          items: lines.map(l => ({ menu_item_id: l.menu_item_id, option: l.option, quantity: l.quantity })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not create the order');
      onCreated && onCreated(d);
      setDone(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="po-overlay" onClick={onClose}>
        <div className="po-sheet po-done" onClick={e => e.stopPropagation()}>
          <div className="po-done-ic">✓</div>
          <h2>Phone order {done.pickup_code} added</h2>
          <p>Total <strong>${Number(done.total).toFixed(2)}</strong> · {done.pay_method === 'link'
            ? 'payment link texted to the customer'
            : 'customer pays by tap at pickup'}.</p>
          <p className="po-muted">It's in the queue and on Clover. The customer got a text with their pickup code.</p>
          <button className="po-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="po-overlay" onClick={onClose}>
      <div className="po-sheet" onClick={e => e.stopPropagation()}>
        <div className="po-head">
          <h2>📞 New phone order <small>{step === 'items' ? 'Step 1 of 2 · Items' : 'Step 2 of 2 · Customer & payment'}</small></h2>
          <button className="po-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {step === 'items' ? (
          <div className="po-body po-one">
            <div className="po-menu">
              <input className="po-input" type="search" placeholder="Search menu…" value={query} onChange={e => setQuery(e.target.value)} />
              <div className="po-menu-list">
                {Object.entries(shown).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="po-cat">{cat}</div>
                    <div className="po-grid">
                      {items.map(it => {
                        const opts = parseOptions(it);
                        const from = opts ? Math.min(...opts.map(o => Number(o.price))) : Number(it.price);
                        const q = qtyOf(it.id);
                        return (
                          <button key={it.id} type="button" className={`po-item ${q ? 'in' : ''}`} onClick={() => tapItem(it)}>
                            <span>{q > 0 && <em className="po-qty">{q}</em>}{it.name}</span>
                            <span className="po-price">{opts ? 'from ' : ''}${from.toFixed(2)} <b>{q ? '✓' : '+'}</b></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {menu.length === 0 && <p className="po-muted">Loading menu…</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="po-body po-one">
            <div className="po-order" ref={orderRef}>
              <button type="button" className="po-back" onClick={() => setStep('items')}>← Add more items</button>
              <div className="po-lines">
                {lines.map(l => (
                  <div key={l.key} className="po-line">
                    <span className="po-line-name">{l.name}</span>
                    <span className="po-step">
                      <button type="button" onClick={() => changeQty(l.key, -1)} aria-label="Less">−</button>
                      <b>{l.quantity}</b>
                      <button type="button" onClick={() => changeQty(l.key, 1)} aria-label="More">+</button>
                    </span>
                    <span className="po-line-total">${(l.price * l.quantity).toFixed(2)}</span>
                  </div>
                ))}
                {lines.length === 0 && <p className="po-muted">No items yet — go back and add some.</p>}
              </div>

              <div className="po-fields">
                <input className="po-input" placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} />
                <input className="po-input" type="tel" inputMode="tel" placeholder="Phone (10 digits)" value={phone} onChange={e => setPhone(e.target.value)} />
                <input className="po-input" placeholder="Note for the kitchen (optional)" value={note} onChange={e => setNote(e.target.value)} />
                <div className="po-seg">
                  <button type="button" className={orderType === 'pickup' ? 'on' : ''} onClick={() => setOrderType('pickup')}>Pickup</button>
                  <button type="button" className={orderType === 'dinein' ? 'on' : ''} onClick={() => setOrderType('dinein')}>Dine-in</button>
                </div>
                <div className="po-paylabel">How will they pay?</div>
                <div className="po-seg">
                  <button type="button" className={payMethod === 'pickup' ? 'on' : ''} onClick={() => setPayMethod('pickup')}>💳 Tap at pickup</button>
                  <button type="button" className={payMethod === 'link' ? 'on' : ''} onClick={() => setPayMethod('link')}>📱 Text pay link</button>
                </div>
              </div>

              <div className="po-totals">
                <div><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div><span>GST 5%</span><span>${tax.toFixed(2)}</span></div>
                <div className="po-grand"><span>Total</span><span>${total.toFixed(2)}</span></div>
              </div>
              {error && <div className="po-error">{error}</div>}
              <button type="button" className="po-primary" disabled={saving || !lines.length} onClick={submit}>
                {saving ? 'Adding…' : `Add order · $${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}

        {step === 'items' && (
          <div className="po-nextbar">
            <span>{count ? `🧾 ${count} item${count === 1 ? '' : 's'} · $${total.toFixed(2)}` : 'Tap items to add them'}</span>
            <button type="button" className="po-next" disabled={!count} onClick={() => { setError(''); setStep('details'); }}>Next →</button>
          </div>
        )}
        {flash && step === 'items' && <div className="po-flash">✓ {flash}</div>}

        {sizeFor && (
          <div className="po-size" onClick={() => setSizeFor(null)}>
            <div className="po-size-box" onClick={e => e.stopPropagation()}>
              <h3>{sizeFor.item.name}</h3>
              {sizeFor.opts.map(o => (
                <button key={o.name} type="button" className="po-item" onClick={() => { addLine(sizeFor.item, o); setSizeFor(null); }}>
                  <span>{o.name}</span><span className="po-price">${Number(o.price).toFixed(2)} <b>+</b></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
