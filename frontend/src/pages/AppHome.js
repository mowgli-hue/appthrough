import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCustomer } from '../utils/customer';

const initials = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '🙂';

// App home: a calm, walk-up first layout — big location cards, no clutter.
export default function AppHome() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState(null);
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState('All');
  const customer = getCustomer();
  const first = (customer?.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    fetch('/api/restaurants').then(r => r.json())
      .then(d => setRestaurants(Array.isArray(d) ? d : []))
      .catch(() => setRestaurants([]));
  }, []);

  const cuisines = useMemo(() => ['All', ...Array.from(new Set((restaurants || []).map(r => r.cuisine).filter(Boolean)))], [restaurants]);
  const shown = (restaurants || []).filter(r =>
    (cuisine === 'All' || r.cuisine === cuisine) &&
    (!q.trim() || `${r.name} ${r.cuisine} ${r.address}`.toLowerCase().includes(q.trim().toLowerCase())));

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim() && !shown.length) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="ah">
      <header className="ah-top">
        <div>
          <p className="ah-greet">{greet}{first ? `, ${first}` : ''} 👋</p>
          <h1 className="ah-title">What are we grabbing?</h1>
        </div>
        <Link to="/account" className="ah-avatar" aria-label="Your profile">
          {customer?.avatar ? <img src={customer.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{initials(customer?.name)}</span>}
        </Link>
      </header>

      <form className="ah-search" onSubmit={submitSearch}>
        <span aria-hidden="true">⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search places or dishes" enterKeyHint="search" />
      </form>

      {cuisines.length > 2 && (
        <div className="ah-chips">
          {cuisines.map(c => (
            <button key={c} type="button" className={`ah-chip ${c === cuisine ? 'on' : ''}`} onClick={() => setCuisine(c)}>{c}</button>
          ))}
        </div>
      )}

      <div className="ah-section-head">
        <h2>Order ahead</h2>
        {restaurants && <span>{shown.length} {shown.length === 1 ? 'place' : 'places'}</span>}
      </div>

      {!restaurants && (
        <div className="ah-list">{[0, 1, 2].map(i => <div key={i} className="ah-card ah-skel" />)}</div>
      )}

      {restaurants && !shown.length && (
        <div className="ah-empty">
          <div className="ah-empty-icon">🍽️</div>
          <p>{q ? 'No places match that search.' : 'No restaurants are taking orders yet — check back soon.'}</p>
        </div>
      )}

      <div className="ah-list">
        {shown.map(r => (
          <Link key={r.id} to={`/restaurant/${r.id}`} className="ah-card">
            <div className="ah-photo" style={r.image ? { backgroundImage: `url(${r.image})` } : undefined}>
              <span className="ah-pill ah-pill-live"><i /> Taking orders</span>
              <span className="ah-pill ah-pill-time">⏱ {r.delivery_time || '15–25 min'}</span>
            </div>
            <div className="ah-body">
              <div className="ah-row">
                <h3>{r.name}</h3>
                <span className="ah-go" aria-hidden="true">→</span>
              </div>
              {r.address && <p className="ah-addr">{r.address}</p>}
              <div className="ah-tags">
                {r.cuisine && <span>{r.cuisine}</span>}
                <span>Walk-up pickup</span>
                <span>Dine-in</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
