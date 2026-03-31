import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`/api/search?q=${encodeURIComponent(query)}`).then(r => r.json()),
      fetch(`/api/restaurants?search=${encodeURIComponent(query)}`).then(r => r.json()),
    ]).then(([itemResults, restaurantResults]) => {
      setResults(itemResults);
      setRestaurants(restaurantResults);
      setLoading(false);
    });
  }, [query]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="search-page">
      <h1>Results for "{query}"</h1>

      {restaurants.length > 0 && (
        <section className="section">
          <h2 className="section-title">Restaurants</h2>
          <div className="search-restaurants">
            {restaurants.map(r => (
              <Link to={`/restaurant/${r.id}`} key={r.id} className="search-restaurant-card">
                <img src={r.image} alt={r.name} />
                <div>
                  <h3>{r.name}</h3>
                  <p>⭐ {r.rating} · {r.cuisine} · {r.delivery_time}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="section">
          <h2 className="section-title">Menu Items</h2>
          <div className="search-items">
            {results.map(item => (
              <Link to={`/restaurant/${item.restaurant_id}`} key={item.id} className="search-item-card">
                <div>
                  <h4>{item.name}</h4>
                  <p className="search-item-desc">{item.description}</p>
                  <p className="search-item-meta">
                    <span className="search-item-price">${item.price.toFixed(2)}</span>
                    <span className="dot">·</span>
                    <span>{item.restaurant_name}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {restaurants.length === 0 && results.length === 0 && (
        <div className="no-results">
          <span className="no-results-icon">🔍</span>
          <h2>No results found</h2>
          <p>Try searching for something else</p>
        </div>
      )}
    </div>
  );
}

export default Search;
