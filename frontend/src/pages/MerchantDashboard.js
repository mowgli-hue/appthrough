import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authHeaders } from '../utils/auth';

function MerchantDashboard() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    fetch(`/api/merchants/${id}/stats`, { headers: { ...authHeaders() } })
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          setUnauthorized(true);
          return null;
        }
        return r.json();
      })
      .then(d => { if (d) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  if (unauthorized) {
    return (
      <div className="error-page">
        <h2>Sign in required</h2>
        <p>You need to be signed in as this restaurant's merchant to view the dashboard.</p>
        <Link to="/login" className="btn-primary">Merchant login</Link>
      </div>
    );
  }
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!data?.restaurant) return <div className="error-page"><h2>Restaurant not found</h2></div>;

  const { restaurant, stats } = data;

  return (
    <div className="merchant-page">
      <div className="merchant-header">
        <div>
          <h1>{restaurant.name}</h1>
          <p>{restaurant.cuisine} · {restaurant.address || 'No address set'}</p>
        </div>
        <Link to={`/admin/${id}`} className="btn-secondary">Settings</Link>
      </div>

      <div className="merchant-stats">
        <div className="stat-card">
          <span className="stat-icon">📦</span>
          <div className="stat-value">{stats.totalOrders}</div>
          <div className="stat-label">Total Orders</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🚶</span>
          <div className="stat-value">{stats.pickupOrders}</div>
          <div className="stat-label">Walk-up Pickups</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <div className="stat-value">${stats.revenue.toFixed(2)}</div>
          <div className="stat-label">Revenue</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔥</span>
          <div className="stat-value">{stats.activeOrders}</div>
          <div className="stat-label">Active Now</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🍽️</span>
          <div className="stat-value">{stats.menuCount}</div>
          <div className="stat-label">Menu Items</div>
        </div>
      </div>

      <div className="merchant-grid">
        <div className="merchant-card">
          <h3>Your Drive-Thru Links</h3>
          <p className="merchant-hint">Share these or open them on your devices.</p>

          <div className="merchant-links">
            <div className="merchant-link-item">
              <div className="merchant-link-icon">📺</div>
              <div className="merchant-link-info">
                <strong>Kiosk Screen</strong>
                <code>/kiosk/{id}</code>
                <small>Open this on a tablet outside your restaurant. Camera sensor auto-detects walk-ups.</small>
              </div>
              <Link to={`/kiosk/${id}`} target="_blank" className="btn-primary btn-sm">Launch</Link>
            </div>

            <div className="merchant-link-item">
              <div className="merchant-link-icon">🍳</div>
              <div className="merchant-link-info">
                <strong>Kitchen Queue</strong>
                <code>/kitchen</code>
                <small>Staff see incoming orders and tap to mark ready (notifies customer).</small>
              </div>
              <Link to="/kitchen" target="_blank" className="btn-primary btn-sm">Open</Link>
            </div>

            <div className="merchant-link-item">
              <div className="merchant-link-icon">⚙️</div>
              <div className="merchant-link-info">
                <strong>Admin Settings</strong>
                <code>/admin/{id}</code>
                <small>Change greeting, pickup instructions, agent personality.</small>
              </div>
              <Link to={`/admin/${id}`} className="btn-secondary btn-sm">Configure</Link>
            </div>

            <div className="merchant-link-item">
              <div className="merchant-link-icon">🎤</div>
              <div className="merchant-link-info">
                <strong>Voice Agent (App)</strong>
                <code>/voice</code>
                <small>Customers can also order from the main app via voice.</small>
              </div>
              <Link to="/voice" target="_blank" className="btn-secondary btn-sm">Try it</Link>
            </div>
          </div>
        </div>

        <div className="merchant-card">
          <h3>How It Works</h3>
          <div className="merchant-how">
            <div className="merchant-how-step">
              <span>1</span>
              <div>
                <strong>Put a tablet outside</strong>
                <p>Open the kiosk URL on any tablet or screen and mount it near your entrance.</p>
              </div>
            </div>
            <div className="merchant-how-step">
              <span>2</span>
              <div>
                <strong>Customer walks up</strong>
                <p>Camera sensor detects them. AI greets them and takes their order by voice.</p>
              </div>
            </div>
            <div className="merchant-how-step">
              <span>3</span>
              <div>
                <strong>Order placed</strong>
                <p>Customer gets a pickup code. They can walk away and browse around.</p>
              </div>
            </div>
            <div className="merchant-how-step">
              <span>4</span>
              <div>
                <strong>Staff marks ready</strong>
                <p>Kitchen taps "Ready" — customer gets a phone notification instantly.</p>
              </div>
            </div>
            <div className="merchant-how-step">
              <span>5</span>
              <div>
                <strong>Customer picks up</strong>
                <p>Shows their code, grabs their food. No line, no wait. Screen resets for the next person.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MerchantDashboard;
