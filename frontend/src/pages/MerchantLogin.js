import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { saveSession } from '../utils/auth';

function MerchantLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      saveSession(data.token, data.merchant?.restaurantId);
      if (data.merchant?.restaurantId) {
        navigate(`/merchant/${data.merchant.restaurantId}`);
      } else {
        navigate('/register');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container" style={{ maxWidth: 440 }}>
        <div className="register-header">
          <h1>Merchant login</h1>
          <p>Sign in to manage your restaurant</p>
        </div>
        <div className="register-card">
          <form onSubmit={handleSubmit}>
            <label className="reg-label">
              Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="reg-label">
              Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </label>
            {error && <p style={{ color: '#e53e3e', marginTop: 8 }}>{error}</p>}
            <div className="reg-actions">
              <button className="btn-primary" type="submit" disabled={loading || !email || !password}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
          <p style={{ marginTop: 16 }}>
            New to App-Thru? <Link to="/register">Register your restaurant</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default MerchantLogin;
