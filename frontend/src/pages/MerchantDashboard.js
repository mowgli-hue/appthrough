import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authHeaders } from '../utils/auth';
import { formatTime } from '../utils/time';

// Same ring as the kitchen page — loud two-tone alert
function playRing(repeats = 3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1174.66];
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
  } catch {}
}

function MerchantDashboard() {
  const { id } = useParams();
  const [tab, setTab] = useState('orders');
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const knownIdsRef = useRef(null);
  const soundOnRef = useRef(false);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const loadStats = useCallback(() => {
    fetch(`/api/merchants/${id}/stats`, { headers: { ...authHeaders() } })
      .then(r => {
        if (r.status === 401 || r.status === 403) { setUnauthorized(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/pickup-orders', { headers: { ...authHeaders() } });
      if (res.status === 401 || res.status === 403) { setUnauthorized(true); return; }
      const list = await res.json();
      const ids = new Set(list.map(o => o.id));
      if (knownIdsRef.current) {
        const fresh = list.filter(o => !knownIdsRef.current.has(o.id));
        if (fresh.length > 0) {
          if (soundOnRef.current) playRing();
          navigator.vibrate?.([300, 150, 300]);
        }
      }
      knownIdsRef.current = ids;
      setOrders(list);
    } catch {}
  }, []);

  const loadMenu = useCallback(() => {
    fetch(`/api/merchants/${id}/menu`, { headers: { ...authHeaders() } })
      .then(r => (r.ok ? r.json() : []))
      .then(setMenu)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    loadStats();
    loadOrders();
    loadMenu();
    const t = setInterval(loadOrders, 4000);
    const s = setInterval(loadStats, 30000);
    return () => { clearInterval(t); clearInterval(s); };
  }, [loadStats, loadOrders, loadMenu]);

  const updateStatus = async (orderId, status) => {
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    loadOrders();
    loadStats();
  };

  const toggleItem = async (item) => {
    setMenu(m => m.map(x => (x.id === item.id ? { ...x, available: item.available ? 0 : 1 } : x)));
    await fetch(`/api/menu-items/${item.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ available: !item.available }),
    });
  };

  if (unauthorized) {
    return (
      <div className="error-page">
        <h2>Sign in required</h2>
        <p>Sign in as this restaurant's merchant to view the dashboard.</p>
        <Link to="/login" className="btn-primary">Merchant login</Link>
      </div>
    );
  }
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!data?.restaurant) return <div className="error-page"><h2>Restaurant not found</h2></div>;

  const { restaurant, stats } = data;
  const menuByCat = menu.reduce((acc, it) => {
    (acc[it.category || 'Other'] = acc[it.category || 'Other'] || []).push(it);
    return acc;
  }, {});

  return (
    <div className="portal-page">
      {/* Header */}
      <div className="portal-header">
        <div className="portal-title">
          <h1>{restaurant.name}</h1>
          <span className="portal-status"><span className="portal-dot" /> Accepting orders</span>
        </div>
        <div className="portal-header-actions">
          <button className={`kitchen-sound-toggle ${soundOn ? 'on' : ''}`} onClick={() => {
            setSoundOn(v => { const n = !v; if (n) playRing(1); return n; });
            window.Notification?.requestPermission?.();
          }}>
            {soundOn ? '🔔 Sound on' : '🔕 Enable sound'}
          </button>
          <Link to={`/admin/${id}`} className="btn-secondary btn-sm">⚙️ Settings</Link>
        </div>
      </div>

      {/* Today at a glance */}
      <div className="portal-kpis">
        <div className="kpi">
          <div className="kpi-value">{stats.todayOrders ?? 0}</div>
          <div className="kpi-label">Orders (24h)</div>
        </div>
        <div className="kpi kpi-money">
          <div className="kpi-value">${(stats.todayRevenue ?? 0).toFixed(2)}</div>
          <div className="kpi-label">Sales (24h)</div>
        </div>
        <div className="kpi kpi-live">
          <div className="kpi-value">{orders.length}</div>
          <div className="kpi-label">In queue now</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">${(stats.avgOrder ?? 0).toFixed(2)}</div>
          <div className="kpi-label">Avg order</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="portal-tabs">
        <button className={tab === 'orders' ? 'portal-tab active' : 'portal-tab'} onClick={() => setTab('orders')}>
          Live Orders {orders.length > 0 && <span className="tab-badge">{orders.length}</span>}
        </button>
        <button className={tab === 'insights' ? 'portal-tab active' : 'portal-tab'} onClick={() => setTab('insights')}>Insights</button>
        <button className={tab === 'menu' ? 'portal-tab active' : 'portal-tab'} onClick={() => setTab('menu')}>Menu</button>
      </div>

      {/* ---- LIVE ORDERS ---- */}
      {tab === 'orders' && (
        orders.length === 0 ? (
          <div className="portal-empty">
            <span>🧑‍🍳</span>
            <h3>No orders in the queue</h3>
            <p>New orders appear here instantly{soundOn ? ' with a ring' : ' — enable sound above to hear them'}.</p>
          </div>
        ) : (
          <div className="portal-orders">
            {orders.map(o => (
              <div key={o.id} className={`portal-order status-${o.status}`}>
                <div className="po-top">
                  <span className="po-code">{o.pickup_code}</span>
                  <span className="po-time">{formatTime(o.created_at)}</span>
                </div>
                <div className="po-customer">{o.customer_name || 'Guest'} · {o.customer_phone}</div>
                <ul className="po-items">
                  {o.items.map((i, idx) => <li key={idx}>{i.quantity}× {i.name}</li>)}
                </ul>
                <div className="po-bottom">
                  <span className="po-total">${Number(o.total).toFixed(2)}</span>
                  {o.status === 'preparing' && (
                    <button className="btn-primary" onClick={() => updateStatus(o.id, 'ready')}>✓ Ready — text customer</button>
                  )}
                  {o.status === 'ready' && (
                    <button className="btn-secondary" onClick={() => updateStatus(o.id, 'picked_up')}>Picked up</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ---- INSIGHTS ---- */}
      {tab === 'insights' && (
        <div className="portal-insights">
          <div className="insight-card">
            <h3>Sales</h3>
            <div className="insight-rows">
              <div className="insight-row"><span>Last 24 hours</span><strong>${(stats.todayRevenue ?? 0).toFixed(2)} · {stats.todayOrders ?? 0} orders</strong></div>
              <div className="insight-row"><span>Last 7 days</span><strong>${(stats.weekRevenue ?? 0).toFixed(2)} · {stats.weekOrders ?? 0} orders</strong></div>
              <div className="insight-row"><span>All time</span><strong>${stats.revenue.toFixed(2)} · {stats.totalOrders} orders</strong></div>
              <div className="insight-row"><span>Average order</span><strong>${(stats.avgOrder ?? 0).toFixed(2)}</strong></div>
            </div>
          </div>
          <div className="insight-card">
            <h3>Top sellers</h3>
            {(stats.topItems || []).length === 0 ? (
              <p className="portal-hint">Appears after your first orders.</p>
            ) : (
              <div className="insight-rows">
                {stats.topItems.map((t, i) => (
                  <div className="insight-row" key={t.name}>
                    <span>{['🥇','🥈','🥉','4.','5.'][i]} {t.name}</span>
                    <strong>{t.qty} sold</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="insight-card">
            <h3>Your links</h3>
            <div className="insight-rows">
              <div className="insight-row"><span>📺 Kiosk screen</span><Link to={`/kiosk/${id}`} target="_blank" className="btn-secondary btn-sm">Open</Link></div>
              <div className="insight-row"><span>🍳 Kitchen tablet</span><Link to="/kitchen" target="_blank" className="btn-secondary btn-sm">Open</Link></div>
              <div className="insight-row"><span>🖨️ QR signs</span><Link to={`/setup/${id}`} className="btn-secondary btn-sm">Print</Link></div>
            </div>
          </div>
        </div>
      )}

      {/* ---- MENU ---- */}
      {tab === 'menu' && (
        <div className="portal-menu">
          <p className="portal-hint">Tap the toggle to mark an item sold out — it disappears from customers and the voice cashier instantly.</p>
          {Object.entries(menuByCat).map(([cat, items]) => (
            <div key={cat} className="portal-menu-section">
              <h3>{cat}</h3>
              {items.map(item => (
                <div key={item.id} className={`portal-menu-item ${item.available ? '' : 'sold-out'}`}>
                  <div className="pmi-info">
                    <strong>{item.name}</strong>
                    <span>${item.price.toFixed(2)}{item.available ? '' : ' · SOLD OUT'}</span>
                  </div>
                  <button
                    className={`availability-toggle ${item.available ? 'on' : ''}`}
                    onClick={() => toggleItem(item)}
                    aria-label={item.available ? 'Mark sold out' : 'Mark available'}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MerchantDashboard;
