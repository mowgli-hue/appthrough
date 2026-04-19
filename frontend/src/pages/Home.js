import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import RestaurantCard from '../components/RestaurantCard';

function Home() {
  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/restaurants').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([restaurantsData, categoriesData]) => {
      setRestaurants(restaurantsData);
      setCategories(categoriesData);
      setLoading(false);
    });
  }, []);

  const handleCategoryClick = (categoryName) => {
    if (activeCategory === categoryName) {
      setActiveCategory(null);
      fetch('/api/restaurants').then(r => r.json()).then(setRestaurants);
    } else {
      setActiveCategory(categoryName);
      fetch(`/api/restaurants?cuisine=${encodeURIComponent(categoryName)}`)
        .then(r => r.json())
        .then(setRestaurants);
    }
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  const featured = restaurants.filter(r => r.featured);

  return (
    <div className="home">
      {/* Landing Hero */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-text">
            <div className="landing-badge">Walk-up ordering for everyone</div>
            <h1>Skip the line.<br />Order by voice.<br />Pick up when ready.</h1>
            <p>
              App-Thru is the drive-through for people on foot. Walk up to any
              restaurant's outdoor screen, talk to our AI agent, and get notified
              on your phone the second your food is ready. No app download. No
              waiting in line.
            </p>
            <div className="landing-ctas">
              <Link to="/voice" className="landing-btn-primary">
                🎤 Try Voice Ordering
              </Link>
              <Link to="/register" className="landing-btn-secondary">
                🏪 List Your Restaurant
              </Link>
            </div>
          </div>
          <div className="landing-hero-visual">
            <div className="landing-phone">
              <div className="landing-phone-screen">
                <div className="landing-phone-header">Order Ready!</div>
                <div className="landing-phone-code">A7K4</div>
                <div className="landing-phone-msg">Walk up and show this code</div>
              </div>
            </div>
            <div className="landing-kiosk">
              <div className="landing-kiosk-screen">
                <span>🤖</span>
                <div>"What can I get you?"</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-how">
        <h2>How App-Thru works</h2>
        <div className="landing-how-grid">
          <div className="landing-how-card">
            <div className="landing-how-num">1</div>
            <span className="landing-how-icon">🚶</span>
            <h3>Walk up</h3>
            <p>Approach the outdoor kiosk screen. The sensor detects you and the AI greets you.</p>
          </div>
          <div className="landing-how-card">
            <div className="landing-how-num">2</div>
            <span className="landing-how-icon">🎤</span>
            <h3>Speak your order</h3>
            <p>Tell the AI what you want — just like a drive-through, but on foot. Or tap the screen.</p>
          </div>
          <div className="landing-how-card">
            <div className="landing-how-num">3</div>
            <span className="landing-how-icon">📱</span>
            <h3>Get your code</h3>
            <p>You get a pickup code and can walk away. Browse, sit down, whatever you want.</p>
          </div>
          <div className="landing-how-card">
            <div className="landing-how-num">4</div>
            <span className="landing-how-icon">🔔</span>
            <h3>Phone buzzes</h3>
            <p>The moment your food is ready, your phone gets a notification. Walk up and grab it.</p>
          </div>
        </div>
      </section>

      {/* For restaurants */}
      <section className="landing-merchants">
        <div className="landing-merchants-inner">
          <div className="landing-merchants-text">
            <h2>For restaurant owners</h2>
            <p>
              Long lines kill revenue. Put a tablet outside your door and let
              App-Thru handle the overflow. Customers order outside, your
              kitchen gets the orders instantly, and nobody leaves because the
              line's too long.
            </p>
            <ul className="landing-merchants-list">
              <li>📺 Deploy a kiosk in minutes — just a tablet and a URL</li>
              <li>🤖 AI agent takes orders by voice — no staff needed outside</li>
              <li>📱 Customers get phone notifications — no pagers, no shouting</li>
              <li>💰 Upsell engine boosts average order value</li>
              <li>📊 Dashboard with order stats and revenue tracking</li>
              <li>🆓 Free to start — no hardware, no contracts</li>
            </ul>
            <Link to="/register" className="landing-btn-primary">
              🚀 Register Your Restaurant
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="section" id="restaurants">
        <h2 className="section-title">Browse by cuisine</h2>
        <div className="categories-scroll">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`category-chip ${activeCategory === cat.name ? 'active' : ''}`}
              onClick={() => handleCategoryClick(cat.name)}
            >
              <span className="category-emoji">{cat.image}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Featured Restaurants */}
      {!activeCategory && featured.length > 0 && (
        <section className="section">
          <h2 className="section-title">Featured restaurants</h2>
          <div className="restaurant-grid">
            {featured.map(r => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
        </section>
      )}

      {/* All Restaurants */}
      <section className="section">
        <h2 className="section-title">
          {activeCategory ? `${activeCategory} restaurants` : 'All restaurants'}
        </h2>
        {restaurants.length === 0 ? (
          <div className="no-results">
            <p>No restaurants found for this category.</p>
          </div>
        ) : (
          <div className="restaurant-grid">
            {restaurants.map(r => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Home;
