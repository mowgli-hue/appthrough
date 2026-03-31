import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import MenuItem from '../components/MenuItem';

function Restaurant() {
  const { id } = useParams();
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
              <span>{restaurant.delivery_time}</span>
              <span className="dot">·</span>
              <span>${restaurant.delivery_fee.toFixed(2)} delivery</span>
            </div>
            <p className="restaurant-description">{restaurant.description}</p>
          </div>
        </div>
      </div>

      <div className="menu-container">
        {Object.entries(restaurant.menu).map(([category, items]) => (
          <div key={category} className="menu-section">
            <h2 className="menu-category-title">{category}</h2>
            <div className="menu-items-grid">
              {items.map(item => (
                <MenuItem key={item.id} item={item} restaurant={restaurantInfo} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Restaurant;
