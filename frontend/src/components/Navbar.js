import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function Navbar({ onCartClick }) {
  const { itemCount } = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🛵</span>
          <span className="brand-text">App-Thru</span>
        </Link>

        <form className="navbar-search" onSubmit={handleSearch}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search for food, restaurants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>

        <div className="navbar-actions">
          <Link to="/register" className="nav-link nav-link-register">List Your Restaurant</Link>
          <Link to="/voice" className="nav-link nav-link-highlight">🎙️ Voice Order</Link>
          <Link to="/orders" className="nav-link">Orders</Link>
          <button className="cart-button" onClick={onCartClick}>
            <span className="cart-icon">🛒</span>
            {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
