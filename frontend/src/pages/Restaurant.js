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
  const [query, setQuery] = useState('');
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
  }, [restaurant, query]);

  // Keep the active tab visible by sliding ONLY the tab strip sideways.
  // (scrollIntoView also scrolls the page on iOS with a sticky bar, which
  // yanked customers back to the top of the menu while they scrolled.)
  useEffect(() => {
    const strip = tabsRef.current;
    const el = strip?.querySelector('.v2-tab.on');
    if (!strip || !el) return;
    const sr = strip.getBoundingClientRect(), er = el.getBoundingClientRect();
    const left = strip.scrollLeft + (er.left - sr.left) - (strip.clientWidth - er.width) / 2;
    try { strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' }); }
    catch { strip.scrollLeft = Math.max(0, left); }
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
    const sec = document.getElementById(`cat-${c}`);
    const bar = document.querySelector('.v2-tabs');
    const offset = (bar ? bar.offsetHeight : 56) + 8;
    if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  };
  const thisCart = cart.restaurantId === restaurant.id;

  // Menu search: matches item name, description, or category (case/accent-insensitive)
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(query.trim());
  const searching = q.length > 0;
  const shownMenu = Object.entries(restaurant.menu || {})
    .map(([category, items]) => [category, searching
      ? items.filter(it => norm(`${it.name} ${it.description || ''} ${category}`).includes(q))
      : items])
    .filter(([, items]) => items.length > 0);
  const resultCount = shownMenu.reduce((n, [, items]) => n + items.length, 0);
  const onSearch = (v) => {
    setQuery(v);
    // If the search bar is pinned at the top, jump back to the start of the
    // menu so the (shorter) results aren't scrolled out of view.
    const bar = document.querySelector('.v2-tabs');
    const menu = document.querySelector('.v2-menu');
    if (bar && menu && bar.getBoundingClientRect().top <= 1) {
      window.scrollTo({ top: Math.max(0, menu.offsetTop - bar.offsetHeight), behavior: 'auto' });
    }
  };

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

      <nav className="v2-tabs" aria-label="Search and categories">
        <div className="v2-search-row">
          <label className="v2-search">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder={`Search ${restaurant.name} menu`}
              value={query}
              onChange={e => onSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              aria-label="Search the menu"
            />
            {query && <button type="button" className="v2-search-x" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
        </div>
        {cats.length > 1 && !searching && (
          <div className="v2-tabs-inner" ref={tabsRef}>
            {cats.map(c => (
              <button key={c} className={`v2-tab ${activeCat === c ? 'on' : ''}`} onClick={() => goCat(c)}>{c}</button>
            ))}
          </div>
        )}
        {searching && (
          <div className="v2-search-meta">{resultCount ? `${resultCount} item${resultCount === 1 ? '' : 's'} match “${query.trim()}”` : ''}</div>
        )}
      </nav>

      <div className="v2-menu">
        {searching && resultCount === 0 && (
          <div className="v2-search-empty">
            <p>No items match “{query.trim()}”.</p>
            <button className="v2-btn ghost" onClick={() => setQuery('')}>Show full menu</button>
          </div>
        )}
        {shownMenu.map(([category, items]) => (
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
