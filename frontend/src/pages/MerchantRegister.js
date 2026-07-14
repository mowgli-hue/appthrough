import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const CUISINES = [
  'American', 'Mexican', 'Italian', 'Chinese', 'Japanese', 'Indian',
  'Thai', 'Mediterranean', 'Korean', 'Vietnamese', 'French', 'BBQ',
  'Seafood', 'Pizza', 'Burger', 'Sushi', 'Cafe', 'Bakery', 'Other',
];

const EMPTY_ITEM = { name: '', price: '', category: 'Main', description: '', popular: false };

function MerchantRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=restaurant info, 2=menu, 3=review
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [info, setInfo] = useState({
    name: '', cuisine: '', description: '', address: '',
    image: '', delivery_time: '15-25 min', delivery_fee: '2.99',
    min_order: '10', greeting: '', pickup_instructions: '',
    email: '', password: '',
  });

  const [menuItems, setMenuItems] = useState([
    { ...EMPTY_ITEM },
  ]);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null); // { type: 'ok'|'err', text }

  const applyImportedItems = (items) => {
    setMenuItems(existing => {
      const kept = existing.filter(i => i.name.trim() && parseFloat(i.price) > 0);
      const have = new Set(kept.map(i => i.name.trim().toLowerCase()));
      const added = items
        .filter(i => !have.has(i.name.trim().toLowerCase()))
        .map(i => ({ ...EMPTY_ITEM, ...i, price: String(i.price) }));
      return [...kept, ...added];
    });
    setImportMsg({ type: 'ok', text: `Imported ${items.length} items — review names, prices, and categories below, then remove anything wrong.` });
  };

  const importFromLink = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch('/api/menu-import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      applyImportedItems(data.items);
    } catch (e) {
      setImportMsg({ type: 'err', text: e.message });
    } finally {
      setImporting(false);
    }
  };

  const importFromPdf = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch('/api/menu-import/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      applyImportedItems(data.items);
    } catch (e) {
      setImportMsg({ type: 'err', text: e.message });
    } finally {
      setImporting(false);
    }
  };

  const updateInfo = (key, val) => setInfo(f => ({ ...f, [key]: val }));

  const updateItem = (index, key, val) => {
    setMenuItems(items => items.map((item, i) => i === index ? { ...item, [key]: val } : item));
  };

  const addItem = () => setMenuItems(items => [...items, { ...EMPTY_ITEM }]);

  const removeItem = (index) => {
    setMenuItems(items => items.filter((_, i) => i !== index));
  };

  const validStep1 = info.name.trim() && info.cuisine && info.email.trim() && info.password.length >= 6;
  const validStep2 = menuItems.some(i => i.name.trim() && parseFloat(i.price) > 0);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/merchants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...info,
          delivery_fee: parseFloat(info.delivery_fee) || 2.99,
          min_order: parseFloat(info.min_order) || 10,
          menuItems: menuItems
            .filter(i => i.name.trim() && parseFloat(i.price) > 0)
            .map(i => ({ ...i, price: parseFloat(i.price) })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Registration failed');
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('appthru_token', data.token);
        localStorage.setItem('appthru_restaurant_id', data.restaurant.id);
      }
      navigate(`/setup/${data.restaurant.id}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-header">
          <h1>Join App-Thru</h1>
          <p>Set up walk-up ordering for your restaurant in minutes. No hardware needed — just a tablet and a dream.</p>
        </div>

        <div className="register-steps">
          <div className={`register-step-dot ${step >= 1 ? 'active' : ''}`}>1. Restaurant</div>
          <div className={`register-step-dot ${step >= 2 ? 'active' : ''}`}>2. Menu</div>
          <div className={`register-step-dot ${step >= 3 ? 'active' : ''}`}>3. Launch</div>
        </div>

        {step === 1 && (
          <div className="register-card">
            <h2>Create your account</h2>

            <div className="reg-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="reg-label">
                Email *
                <input type="email" value={info.email} onChange={e => updateInfo('email', e.target.value)} placeholder="you@restaurant.com" />
              </label>
              <label className="reg-label">
                Password *
                <input type="password" value={info.password} onChange={e => updateInfo('password', e.target.value)} placeholder="At least 6 characters" />
              </label>
            </div>

            <h2 style={{ marginTop: '1rem' }}>Tell us about your restaurant</h2>

            <label className="reg-label">
              Restaurant Name *
              <input type="text" value={info.name} onChange={e => updateInfo('name', e.target.value)} placeholder="Joe's Burgers" />
            </label>

            <label className="reg-label">
              Cuisine Type *
              <select value={info.cuisine} onChange={e => updateInfo('cuisine', e.target.value)}>
                <option value="">Select cuisine...</option>
                {CUISINES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="reg-label">
              Description
              <textarea rows={2} value={info.description} onChange={e => updateInfo('description', e.target.value)} placeholder="Best burgers in town since 1985" />
            </label>

            <label className="reg-label">
              Address
              <input type="text" value={info.address} onChange={e => updateInfo('address', e.target.value)} placeholder="123 Main St, City" />
            </label>

            <label className="reg-label">
              Restaurant Image URL
              <input type="text" value={info.image} onChange={e => updateInfo('image', e.target.value)} placeholder="https://... (optional)" />
            </label>

            <div className="reg-row">
              <label className="reg-label">
                Estimated Prep Time
                <input type="text" value={info.delivery_time} onChange={e => updateInfo('delivery_time', e.target.value)} />
              </label>
              <label className="reg-label">
                Delivery Fee ($)
                <input type="number" step="0.01" value={info.delivery_fee} onChange={e => updateInfo('delivery_fee', e.target.value)} />
              </label>
              <label className="reg-label">
                Min Order ($)
                <input type="number" step="0.01" value={info.min_order} onChange={e => updateInfo('min_order', e.target.value)} />
              </label>
            </div>

            <h3 style={{ marginTop: '1rem' }}>Kiosk & Greeting Settings (optional)</h3>

            <label className="reg-label">
              AI Greeting
              <input type="text" value={info.greeting} onChange={e => updateInfo('greeting', e.target.value)} placeholder="Welcome to Joe's! How are you doing today?" />
            </label>

            <label className="reg-label">
              Pickup Instructions
              <input type="text" value={info.pickup_instructions} onChange={e => updateInfo('pickup_instructions', e.target.value)} placeholder="Pick up at the counter near the entrance" />
            </label>

            <div className="reg-actions">
              <div />
              <button className="btn-primary" disabled={!validStep1} onClick={() => setStep(2)}>
                Next: Add Menu →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="register-card">
            <h2>Build your menu</h2>
            <p className="reg-hint">Add the items customers can order from your kiosk. You can edit these anytime later.</p>

            <div className="menu-import">
              <h3>⚡ Import your existing menu</h3>
              <p className="reg-hint">Paste a link to your menu page (or a PDF link), or upload a menu PDF — we'll pull in the items automatically so you don't have to type them.</p>
              <div className="menu-import-row">
                <input
                  type="url"
                  placeholder="https://your-restaurant.com/menu"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && importFromLink()}
                />
                <button className="btn-primary" onClick={importFromLink} disabled={importing || !importUrl.trim()}>
                  {importing ? 'Importing…' : 'Fetch menu'}
                </button>
              </div>
              <div className="menu-import-or">
                <span>or</span>
                <label className="btn-secondary menu-import-file">
                  📄 Upload menu PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: 'none' }}
                    disabled={importing}
                    onChange={e => { importFromPdf(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
              </div>
              {importMsg && (
                <p className={importMsg.type === 'ok' ? 'menu-import-ok' : 'menu-import-err'}>{importMsg.text}</p>
              )}
            </div>

            <div className="menu-builder">
              {menuItems.map((item, i) => (
                <div key={i} className="menu-builder-item">
                  <div className="menu-builder-row">
                    <input
                      type="text"
                      placeholder="Item name *"
                      value={item.name}
                      onChange={e => updateItem(i, 'name', e.target.value)}
                      className="menu-builder-name"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price *"
                      value={item.price}
                      onChange={e => updateItem(i, 'price', e.target.value)}
                      className="menu-builder-price"
                    />
                    <select
                      value={item.category}
                      onChange={e => updateItem(i, 'category', e.target.value)}
                      className="menu-builder-cat"
                    >
                      <option>Main</option>
                      <option>Appetizer</option>
                      <option>Side</option>
                      <option>Drink</option>
                      <option>Dessert</option>
                      <option>Combo</option>
                    </select>
                    <label className="menu-builder-pop">
                      <input
                        type="checkbox"
                        checked={item.popular}
                        onChange={e => updateItem(i, 'popular', e.target.checked)}
                      />
                      Popular
                    </label>
                    <button className="menu-builder-remove" onClick={() => removeItem(i)} title="Remove">
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={item.description}
                    onChange={e => updateItem(i, 'description', e.target.value)}
                    className="menu-builder-desc"
                  />
                </div>
              ))}
            </div>

            <button className="btn-secondary menu-add-btn" onClick={addItem}>
              + Add Menu Item
            </button>

            <div className="reg-actions">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary" disabled={!validStep2} onClick={() => setStep(3)}>
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="register-card">
            <h2>Review &amp; Launch</h2>

            <div className="review-section">
              <h3>{info.name}</h3>
              <p>{info.cuisine} {info.description && `— ${info.description}`}</p>
              {info.address && <p>📍 {info.address}</p>}
              <p>⏱️ {info.delivery_time} · 💰 ${parseFloat(info.delivery_fee || 0).toFixed(2)} delivery fee</p>
              {info.greeting && <p>🤖 Greeting: "{info.greeting}"</p>}
            </div>

            <div className="review-section">
              <h3>Menu ({menuItems.filter(i => i.name.trim() && parseFloat(i.price) > 0).length} items)</h3>
              <div className="review-menu">
                {menuItems.filter(i => i.name.trim() && parseFloat(i.price) > 0).map((item, i) => (
                  <div key={i} className="review-menu-item">
                    <span>{item.popular && '⭐ '}{item.name}</span>
                    <span>${parseFloat(item.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="review-section review-whatyouget">
              <h3>What you get</h3>
              <ul>
                <li>📺 <strong>Outdoor kiosk screen</strong> — deploy on any tablet</li>
                <li>🎤 <strong>AI voice agent</strong> — takes orders by speaking</li>
                <li>📱 <strong>Phone notifications</strong> — texts customers when ready</li>
                <li>🚶 <strong>Camera sensor</strong> — auto-detects walk-ups</li>
                <li>🍳 <strong>Kitchen queue</strong> — staff marks orders ready</li>
                <li>💰 <strong>Upsell engine</strong> — suggests add-ons automatically</li>
                <li>📊 <strong>Dashboard</strong> — track orders and revenue</li>
              </ul>
            </div>

            {error && <div className="checkout-error">{error}</div>}

            <div className="reg-actions">
              <button className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="btn-primary btn-large" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Setting up...' : '🚀 Launch on App-Thru'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MerchantRegister;
