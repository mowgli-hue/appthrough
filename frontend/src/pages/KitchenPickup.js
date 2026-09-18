import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { authHeaders, getToken, getRestaurantId } from '../utils/auth';
import { playNewOrderChime, autoUnlockOnFirstTap } from '../utils/alertSound';
import { formatTime } from '../utils/time';


function KitchenPickup() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(!getToken());
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('appthru_sound') !== 'off');
  const [view, setView] = useState('orders'); // orders | stock
  const [menu, setMenu] = useState([]);
  const [newIds, setNewIds] = useState(() => new Set());
  const knownIdsRef = useRef(null); // null until first successful load
  const soundOnRef = useRef(false);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pickup-orders', { headers: { ...authHeaders() } });
      if (res.status === 401 || res.status === 403) {
        setUnauthorized(true);
        return;
      }
      const data = await res.json();
      setUnauthorized(false);
      setOrders(data);

      // Ring + highlight when an order we haven't seen arrives (skip first load)
      const ids = new Set(data.map(o => o.id));
      if (knownIdsRef.current) {
        const fresh = data.filter(o => !knownIdsRef.current.has(o.id)).map(o => o.id);
        if (fresh.length > 0) {
          setNewIds(prev => new Set([...prev, ...fresh]));
          if (soundOnRef.current) playNewOrderChime();
          navigator.vibrate?.([300, 150, 300]);
          if (window.Notification?.permission === 'granted') {
            new Notification('New pickup order!', { body: `${fresh.length} new order(s) in the queue` });
          }
        }
      }
      knownIdsRef.current = ids;
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  const acknowledge = (orderId) => {
    setNewIds(prev => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  };

  useEffect(() => { autoUnlockOnFirstTap(); }, []);

  const loadMenu = useCallback(() => {
    const rid = getRestaurantId();
    if (!rid) return;
    fetch(`/api/merchants/${rid}/menu`, { headers: { ...authHeaders() } })
      .then(r => (r.ok ? r.json() : []))
      .then(setMenu)
      .catch(() => {});
  }, []);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  const toggleItem = async (item) => {
    setMenu(m => m.map(x => (x.id === item.id ? { ...x, available: item.available ? 0 : 1 } : x)));
    await fetch(`/api/menu-items/${item.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ available: !item.available }),
    });
  };

  const toggleSound = () => {
    setSoundOn(prev => {
      const next = !prev;
      localStorage.setItem('appthru_sound', next ? 'on' : 'off');
      if (next) {
        playNewOrderChime(1); // user gesture unlocks audio + confirms volume
        window.Notification?.requestPermission?.();
      }
      return next;
    });
  };

  const updateStatus = async (orderId, status) => {
    acknowledge(orderId);
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    load();
  };

  if (unauthorized) {
    return (
      <div className="kitchen-page">
        <div className="kitchen-header kitchen-header-simple">
          <h1>Orders</h1>
        </div>
        <p>Sign in as the restaurant to see orders.</p>
        <Link to="/login" className="btn-primary">Merchant login</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="kitchen-page">
      <div className="kitchen-header kitchen-header-simple">
        <div className="kitchen-views">
          <button className={view === 'orders' ? 'kview active' : 'kview'} onClick={() => setView('orders')}>Orders</button>
          <button className={view === 'stock' ? 'kview active' : 'kview'} onClick={() => { setView('stock'); loadMenu(); }}>Sold out</button>
        </div>
        <button
          className={`kitchen-sound-toggle ${soundOn ? 'on' : ''}`}
          onClick={toggleSound}
        >
          {soundOn ? '🔔 Sound on' : '🔕 Tap to enable sound'}
        </button>
      </div>

      {view === 'stock' && (
        <div className="portal-menu">
          <p className="portal-hint">Flip the toggle when something runs out — customers stop seeing it instantly.</p>
          {menu.map(item => (
            <div key={item.id} className={`portal-menu-item ${item.available ? '' : 'sold-out'}`}>
              <div className="pmi-info">
                <strong>{item.name}</strong>
                <span>{item.category}{item.available ? '' : ' · SOLD OUT'}</span>
              </div>
              <button className={`availability-toggle ${item.available ? 'on' : ''}`} onClick={() => toggleItem(item)}>
                <span className="toggle-knob" />
              </button>
            </div>
          ))}
        </div>
      )}

      {view === 'orders' && (orders.length === 0 ? (
        <div className="no-results">
          <span className="no-results-icon">🧑‍🍳</span>
          <h2>No pickup orders in the queue</h2>
          <p>New walk-up pickup orders will appear here in real time.</p>
        </div>
      ) : (
        <div className="kitchen-grid">
          {orders.map(order => (
            <div
              key={order.id}
              className={`kitchen-card status-${order.status} ${newIds.has(order.id) ? 'kitchen-card-new' : ''}`}
              onClick={() => acknowledge(order.id)}
            >
              {newIds.has(order.id) && <div className="kitchen-new-badge">NEW ORDER — tap to acknowledge</div>}
              <div className="kitchen-card-top">
                <div className="kitchen-code">{order.pickup_code}</div>
                <span className={`status-badge status-${order.status}`}>
                  {order.status}
                </span>
              </div>
              <div className="kitchen-meta">
                <strong>{order.customer_name || 'Guest'}</strong>
                <span>📞 {order.customer_phone}</span>
                <span className="kitchen-restaurant">{order.restaurant_name}</span>
                <span className="kitchen-time">
                  Placed {formatTime(order.created_at)}
                </span>
              </div>
              {order.note && <div className="order-note">📝 {order.note}</div>}
              <ul className="kitchen-items">
                {order.items.map((item, i) => (
                  <li key={i}>
                    <span>{item.quantity}x {item.name}</span>
                  </li>
                ))}
              </ul>
              <div className="kitchen-actions">
                {order.status === 'preparing' && (
                  <button
                    className="btn-primary"
                    onClick={() => updateStatus(order.id, 'ready')}
                  >
                    🛎️ Mark Ready &amp; Notify
                  </button>
                )}
                {order.status === 'ready' && (
                  <button
                    className="btn-secondary"
                    onClick={() => updateStatus(order.id, 'picked_up')}
                  >
                    ✅ Mark Picked Up
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default KitchenPickup;
