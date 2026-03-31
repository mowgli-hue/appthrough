import React, { useState, useEffect } from 'react';
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
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Delicious food,<br />delivered to your door</h1>
          <p>Order from the best local restaurants with easy, on-demand delivery.</p>
        </div>
      </section>

      {/* Categories */}
      <section className="section">
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
