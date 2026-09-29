import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { playNewOrderChime, autoUnlockOnFirstTap } from '../utils/alertSound';

// In-store order status board (open on a TV/tablet at the counter).
// PREPARING on the left, READY on the right; dings when an order flips to ready.
function OrderBoard() {
  const { restaurantId } = useParams();
  const [orders, setOrders] = useState([]);
  const [restaurantName, setRestaurantName] = useState('');
  const readyCodesRef = useRef(new Set());

  useEffect(() => { autoUnlockOnFirstTap(); }, []);

  useEffect(() => {
    fetch(`/api/restaurants/${restaurantId}`)
      .then(r => r.json())
      .then(d => setRestaurantName(d.name || ''))
      .catch(() => {});
  }, [restaurantId]);

  const load = useCallback(async () => {
    try {
      const list = await fetch(`/api/restaurants/${restaurantId}/board`).then(r => r.json());
      const readyNow = new Set(list.filter(o => o.status === 'ready').map(o => o.code));
      // Ding once for each order that just became ready
      for (const code of readyNow) {
        if (!readyCodesRef.current.has(code)) {
          playNewOrderChime(1);
          break;
        }
      }
      readyCodesRef.current = readyNow;
      setOrders(list);
    } catch {}
  }, [restaurantId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const preparing = orders.filter(o => o.status === 'preparing');
  const ready = orders.filter(o => o.status === 'ready');

  return (
    <div className="board-page">
      <div className="board-header">
        <span className="board-brand">{restaurantName || 'The Chai Bar'}</span>
        <span className="board-title">Order Status</span>
      </div>
      <div className="board-columns">
        <div className="board-col">
          <h2 className="board-col-title">👨‍🍳 Preparing</h2>
          {preparing.length === 0 && <p className="board-empty">—</p>}
          {preparing.map(o => (
            <div key={o.code} className="board-card">
              <span className="board-code">{o.code}</span>
              {o.name && <span className="board-name">{o.name}</span>}
            </div>
          ))}
        </div>
        <div className="board-col board-col-ready">
          <h2 className="board-col-title">✅ Ready — pick up!</h2>
          {ready.length === 0 && <p className="board-empty">—</p>}
          {ready.map(o => (
            <div key={o.code} className="board-card board-card-ready">
              <span className="board-code">{o.code}</span>
              {o.name && <span className="board-name">{o.name}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OrderBoard;
