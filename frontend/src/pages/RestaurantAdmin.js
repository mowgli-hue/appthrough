import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authHeaders } from '../utils/auth';

function RestaurantAdmin() {
  const { id } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    greeting: '',
    pickup_instructions: '',
    agent_voice: 'friendly',
    drive_thru_enabled: true,
    notification_phone: '',
    notification_email: '',
    clover_mid: '',
    clover_token: '',
  });
  const [cloverStatus, setCloverStatus] = useState(null);
  const testClover = async () => {
    setCloverStatus({ ok: null, message: 'Testing…' });
    const r = await fetch(`/api/merchants/${id}/clover/test`, { headers: { ...authHeaders() } });
    setCloverStatus(r.ok ? await r.json() : { ok: false, message: 'Sign in as this restaurant to test.' });
  };

  useEffect(() => {
    fetch(`/api/merchants/${id}/settings`, { headers: { ...authHeaders() } })
      .then(r => (r.ok ? r.json() : fetch(`/api/restaurants/${id}`).then(x => x.json())))
      .then(data => {
        setRestaurant(data);
        setForm({
          greeting: data.greeting || '',
          pickup_instructions: data.pickup_instructions || '',
          agent_voice: data.agent_voice || 'friendly',
          drive_thru_enabled: data.drive_thru_enabled !== 0,
          notification_phone: data.notification_phone || '',
          notification_email: data.notification_email || '',
          clover_mid: data.clover_mid || '',
          clover_token: data.clover_token || '',
        });
        setLoading(false);
      });
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    const res = await fetch(`/api/restaurants/${id}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.status === 401 || res.status === 403) {
      setSaveError('You must be signed in as this restaurant\'s merchant to save changes.');
      return;
    }
    if (!res.ok) {
      setSaveError('Could not save changes. Please try again.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>Configure App-Thru</h1>
          <p>{restaurant.name}</p>
        </div>
        <Link to={`/kiosk/${id}`} className="btn-primary" target="_blank">
          Launch Kiosk →
        </Link>
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>General Settings</h3>

          <label className="admin-label">
            Walk-up Kiosk
            <div className="admin-toggle-row">
              <button
                className={`admin-toggle ${form.drive_thru_enabled ? 'on' : ''}`}
                onClick={() => update('drive_thru_enabled', !form.drive_thru_enabled)}
              >
                <span className="admin-toggle-knob" />
              </button>
              <span>{form.drive_thru_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </label>

          <label className="admin-label">
            Custom Greeting
            <small>What the AI says when a customer walks up. Leave blank for default.</small>
            <textarea
              className="admin-textarea"
              placeholder={`Welcome to ${restaurant.name}! How are you doing today?`}
              value={form.greeting}
              onChange={e => update('greeting', e.target.value)}
              rows={3}
            />
          </label>

          <label className="admin-label">
            Pickup Instructions
            <small>Shown to customers after they order (e.g. "Pick up at window #2")</small>
            <textarea
              className="admin-textarea"
              placeholder="Pick up at the counter near the entrance"
              value={form.pickup_instructions}
              onChange={e => update('pickup_instructions', e.target.value)}
              rows={2}
            />
          </label>

          <label className="admin-label">
            New-Order Text Alerts
            <small>We text this number every time an order comes in (owner or manager's mobile)</small>
            <input
              type="tel"
              className="admin-textarea"
              style={{ minHeight: 'auto', padding: '10px 14px' }}
              placeholder="+1 403 555 0123"
              value={form.notification_phone}
              onChange={e => update('notification_phone', e.target.value)}
            />
          </label>

          <label className="admin-label">
            New-Order Email Alerts
            <small>We also email this address every time an order comes in</small>
            <input
              type="email"
              className="admin-textarea"
              style={{ minHeight: 'auto', padding: '10px 14px' }}
              placeholder="orders@yourrestaurant.com"
              value={form.notification_email}
              onChange={e => update('notification_email', e.target.value)}
            />
          </label>

          <div className="admin-clover">
            <strong>Clover POS (optional)</strong>
            <p className="admin-hint">Paid App-Thru orders appear on your Clover and print automatically. In your Clover dashboard: Account &amp; Setup → API tokens → create a token with Orders, Payments and Merchant access. Your Merchant ID is in the dashboard address bar after <code>/m/</code>.</p>
            <input className="admin-textarea" style={{ minHeight: 'auto', padding: '10px 14px' }} placeholder="Clover Merchant ID (e.g. 450SYFQ0RVPA1)" value={form.clover_mid} onChange={e => update('clover_mid', e.target.value)} />
            <input className="admin-textarea" style={{ minHeight: 'auto', padding: '10px 14px', marginTop: 8 }} type="password" placeholder="Clover API token" value={form.clover_token} onChange={e => update('clover_token', e.target.value)} />
            <button type="button" className="btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={testClover}>Test connection</button>
            {cloverStatus && <p className={`admin-hint ${cloverStatus.ok ? 'ok' : cloverStatus.ok === false ? 'bad' : ''}`}>{cloverStatus.message}</p>}
          </div>

          <label className="admin-label">
            Agent Personality
            <select
              className="admin-select"
              value={form.agent_voice}
              onChange={e => update('agent_voice', e.target.value)}
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="enthusiastic">Enthusiastic</option>
            </select>
          </label>
        </div>

        <div className="admin-card">
          <h3>Kiosk Preview</h3>
          <div className="admin-preview">
            <div className="admin-preview-screen">
              <div className="admin-preview-idle">
                <span className="admin-preview-icon">🚶</span>
                <strong>{restaurant.name}</strong>
                <span>Walk up to order</span>
                <small className="admin-preview-sensor">
                  <span className="kiosk-sensor-dot" /> Sensor active
                </small>
              </div>
            </div>
            <p className="admin-preview-hint">
              Deploy this on a tablet outside your restaurant.
              Customers walk up, the camera sensor detects them,
              and the AI takes their order by voice.
            </p>
          </div>

          <h3 style={{ marginTop: '1.5rem' }}>Quick Links</h3>
          <div className="admin-links">
            <Link to={`/kiosk/${id}`} target="_blank" className="admin-link-card">
              <span>📺</span>
              <div>
                <strong>Kiosk Screen</strong>
                <small>/kiosk/{id}</small>
              </div>
            </Link>
            <Link to="/kitchen" className="admin-link-card">
              <span>🍳</span>
              <div>
                <strong>Kitchen Queue</strong>
                <small>Mark orders ready</small>
              </div>
            </Link>
            <Link to="/orders" className="admin-link-card">
              <span>📋</span>
              <div>
                <strong>All Orders</strong>
                <small>Order history</small>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="admin-save-bar">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        {saved && <span className="admin-saved">Saved!</span>}
        {saveError && <span style={{ color: '#e53e3e', marginLeft: 12 }}>{saveError}</span>}
      </div>
    </div>
  );
}

export default RestaurantAdmin;
