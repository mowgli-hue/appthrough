import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { authHeaders, getToken } from '../utils/auth';

// Ascending two-tone ring, repeated — loud enough for a kitchen.
function playRing(repeats = 3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1174.66]; // A5, D6
    for (let r = 0; r < repeats; r++) {
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + r * 0.7 + i * 0.25;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    }
  } catch { /* no audio available */ }
}

function KitchenPickup() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(!getToken());
  const [soundOn, setSoundOn] = useState(false);
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
          if (soundOnRef.current) playRing();
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

  const toggleSound = () => {
    setSoundOn(prev => {
      const next = !prev;
      if (next) {
        playRing(1); // user gesture unlocks audio + confirms volume
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
        <div className="kitchen-header">
          <h1>Kitchen — Pickup Orders</h1>
        </div>
        <p>You need to be signed in as this restaurant's merchant to view the kitchen queue.</p>
        <Link to="/login" className="btn-primary">Merchant login</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="kitchen-page">
      <div className="kitchen-header">
        <h1>🍳 Kitchen — Walk-up Pickup Queue</h1>
        <p>Mark orders as ready to notify the customer on their phone.</p>
        <button
          className={`kitchen-sound-toggle ${soundOn ? 'on' : ''}`}
          onClick={toggleSound}
        >
          {soundOn ? '🔔 Ring on new orders: ON' : '🔕 Ring on new orders: OFF — tap to enable'}
        </button>
      </div>

      {orders.length === 0 ? (
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
                  Placed {new Date(order.created_at).toLocaleTimeString()}
                </span>
              </div>
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
      )}
    </div>
  );
}

export default KitchenPickup;
