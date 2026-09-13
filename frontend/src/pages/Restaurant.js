import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MenuItem from '../components/MenuItem';
import { useCart } from '../context/CartContext';

function Restaurant() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { itemCount, subtotal, tax } = useCart();
  const cartTotal = Math.round((subtotal + tax + 1.0) * 100) / 100; // incl. $1 App-Thru fee
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/restaurants/${id}`)
      .then(r => r.json())
      .then(data => {
        setRestaurant(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!restaurant) {
    return <div className="error-page"><h2>Restaurant not found</h2></div>;
  }

  const restaurantInfo = {
    id: restaurant.id,
    name: restaurant.name,
    delivery_fee: restaurant.delivery_fee,
  };

  return (
    <div className="restaurant-page">
      <div className="restaurant-hero">
        <img src={restaurant.image} alt={restaurant.name} />
        <div className="restaurant-hero-overlay">
          <div className="restaurant-hero-content">
            <h1>{restaurant.name}</h1>
            <div className="restaurant-hero-meta">
              <span>⭐ {restaurant.rating}</span>
              <span className="dot">·</span>
              <span>{restaurant.cuisine}</span>
              <span className="dot">·</span>
              <span>⏱ {restaurant.delivery_time}</span>
              <span className="dot">·</span>
              <span>🚶 Walk-up pickup</span>
            </div>
            <p className="restaurant-description">{restaurant.description}</p>
          </div>
        </div>
      </div>

      {/* Sticky category navigation */}
      <div className="category-chips">
        {Object.keys(restaurant.menu).map(category => (
          <button
            key={category}
            className="category-chip"
            onClick={() => document.getElementById(`cat-${category}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="menu-container">
        {Object.entries(restaurant.menu).map(([category, items]) => (
          <div key={category} className="menu-section" id={`cat-${category}`}>
            <h2 className="menu-category-title">{category}</h2>
            <div className="menu-items-grid">
              {items.map(item => (
                <MenuItem key={item.id} item={item} restaurant={restaurantInfo} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Floating cart bar — appears once something is added */}
      {itemCount > 0 && (
        <button className="floating-cart-bar" onClick={() => navigate('/checkout')}>
          <span className="fcb-count">{itemCount}</span>
          <span className="fcb-label">View cart &amp; checkout</span>
          <span className="fcb-total">${cartTotal.toFixed(2)} →</span>
        </button>
      )}
    </div>
  );
}

export default Restaurant;
