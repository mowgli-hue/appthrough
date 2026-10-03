import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MenuItem from '../components/MenuItem';
import { useCart } from '../context/CartContext';

function Restaurant() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { itemCount, subtotal, tax, cart } = useCart();
  const cartTotal = Math.round((subtotal + tax + 0.99) * 100) / 100; // incl. $0.99 App-Thru fee
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('');
  const tabsRef = useRef(null);

  useEffect(() => {
    fetch(`/api/restaurants/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { setRestaurant(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  // Highlight the category tab for the section currently on screen
  useEffect(() => {
    if (!restaurant) return;
    const sections = Array.from(document.querySelectorAll('.v2-menu-section'));
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActiveCat(vis[0].target.dataset.cat);
    }, { rootMargin: '-80px 0px -65% 0px' });
    sections.forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, [restaurant]);

  // Keep the active tab scrolled into view
  useEffect(() => {
    const el = tabsRef.current?.querySelector('.v2-tab.on');
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCat]);

  if (loading) return <div className="v2"><div className="loading"><div className="spinner"></div></div></div>;
  if (!restaurant) {
    return (
      <div className="v2"><div className="v2-empty">
        <div className="ic">🍽️</div>
        <h2>This place isn't taking orders</h2>
        <p>It may have closed or moved. Pick another spot.</p>
        <button className="v2-btn" onClick={() => navigate('/')}>See places</button>
      </div></div>
    );
  }

  const restaurantInfo = { id: restaurant.id, name: restaurant.name, delivery_fee: restaurant.delivery_fee };
  const cats = Object.keys(restaurant.menu || {});
  const goCat = (c) => {
    setActiveCat(c);
    document.getElementById(`cat-${c}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const thisCart = cart.restaurantId === restaurant.id;

  return (
    <div className="v2">
      <div className="v2-rest-hero" style={restaurant.image ? { backgroundImage: `url(${restaurant.image})` } : undefined}>
        <button className="v2-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Back">←</button>
      </div>

      <div className="v2-rest-info">
        <div className="v2-card">
          <h1 className="v2-rest-name">{restaurant.name}</h1>
          {(restaurant.address || restaurant.cuisine) && (
            <p className="v2-rest-sub">{[restaurant.cuisine, restaurant.address].filter(Boolean).join(' · ')}</p>
          )}
          <div className="v2-rest-pills">
            <span className="v2-pill ok">● Taking orders</span>
            <span className="v2-pill">⏱ {restaurant.delivery_time || '15–25 min'}</span>
            <span className="v2-pill">Walk-up pickup</span>
            <span className="v2-pill">Dine-in</span>
          </div>
        </div>
      </div>

      {cats.length > 1 && (
        <nav className="v2-tabs" aria-label="Menu categories">
          <div className="v2-tabs-inner" ref={tabsRef}>
            {cats.map(c => (
              <button key={c} className={`v2-tab ${activeCat === c ? 'on' : ''}`} onClick={() => goCat(c)}>{c}</button>
            ))}
          </div>
        </nav>
      )}

      <div className="v2-menu">
        {Object.entries(restaurant.menu || {}).map(([category, items]) => (
          <section key={category} className="v2-menu-section" id={`cat-${category}`} data-cat={category}>
            <h2 className="v2-menu-title">{category}</h2>
            <div className="v2-menu-list">
              {items.map(item => <MenuItem key={item.id} item={item} restaurant={restaurantInfo} />)}
            </div>
          </section>
        ))}
      </div>

      {itemCount > 0 && thisCart && (
        <button className="v2-cartbar" onClick={() => navigate('/checkout')}>
          <span className="n">{itemCount}</span>
          <span className="l">View order</span>
          <span className="t">${cartTotal.toFixed(2)}</span>
        </button>
      )}
    </div>
  );
}

export default Restaurant;
