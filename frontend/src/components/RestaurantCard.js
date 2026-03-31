import React from 'react';
import { Link } from 'react-router-dom';

function RestaurantCard({ restaurant }) {
  return (
    <Link to={`/restaurant/${restaurant.id}`} className="restaurant-card">
      <div className="restaurant-card-image">
        <img src={restaurant.image} alt={restaurant.name} loading="lazy" />
        <span className="delivery-time">{restaurant.delivery_time}</span>
      </div>
      <div className="restaurant-card-info">
        <h3>{restaurant.name}</h3>
        <div className="restaurant-meta">
          <span className="rating">⭐ {restaurant.rating}</span>
          <span className="dot">·</span>
          <span>{restaurant.cuisine}</span>
          <span className="dot">·</span>
          <span>${restaurant.delivery_fee.toFixed(2)} delivery</span>
        </div>
      </div>
    </Link>
  );
}

export default RestaurantCard;
