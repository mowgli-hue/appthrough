import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function KioskSelect() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => { setRestaurants(data); setLoading(false); });
  }, []);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div className="kiosk-select-page">
      <div className="kiosk-select-header">
        <h1>Launch a Kiosk</h1>
        <p>Pick a restaurant to open its outdoor kiosk screen</p>
      </div>
      <div className="kiosk-select-grid">
        {restaurants.map(r => (
          <Link to={`/kiosk/${r.id}`} key={r.id} className="kiosk-select-card">
            <div className="kiosk-select-img" style={{ backgroundImage: `url(${r.image})` }} />
            <div className="kiosk-select-info">
              <h3>{r.name}</h3>
              <span>{r.cuisine}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default KioskSelect;
