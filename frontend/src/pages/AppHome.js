import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCustomer } from '../utils/customer';

// Home screen inside the mobile app: just the places you can order from.
export default function AppHome() {
  const [restaurants, setRestaurants] = useState(null);
  const customer = getCustomer();
  const first = (customer?.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    fetch('/api/restaurants').then(r => r.json()).then(d => setRestaurants(Array.isArray(d) ? d : [])).catch(() => setRestaurants([]));
  }, []);

  return (
    <div className="app-home">
      <div className="app-home-head">
        <p className="app-home-greet">{greet}{first ? `, ${first}` : ''}</p>
        <h1 className="app-home-title">Where are you ordering from?</h1>
      </div>

      {!restaurants && <div className="loading"><div className="spinner"></div></div>}
      {restaurants && restaurants.length === 0 && <p className="account-muted">No locations available right now.</p>}

      <div className="app-loc-list">
        {(restaurants || []).map(r => (
          <Link key={r.id} to={`/restaurant/${r.id}`} className="app-loc-card">
            <div className="app-loc-img" style={{ backgroundImage: `url(${r.image})` }} />
            <div className="app-loc-info">
              <h3>{r.name}</h3>
              {r.address && <p className="app-loc-addr">{r.address}</p>}
              <p className="app-loc-meta">⏱ {r.delivery_time || '15-25 min'} · Pickup &amp; dine-in</p>
            </div>
            <span className="app-loc-go">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
