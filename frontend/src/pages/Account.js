import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  saveSession, continueAsGuest, getCustomer, getCustomerToken, signOut,
  customerHeaders, updateProfile, openInBrowser,
} from '../utils/customer';

export function SignIn() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin'); // signin | create
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const path = mode === 'create' ? '/api/customers/register' : '/api/customers/login';
      const body = mode === 'create' ? form : { email: form.email, password: form.password };
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      saveSession(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const guest = () => { continueAsGuest(); navigate('/', { replace: true }); };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="auth-logo" src="/applogo.png" alt="App-Thru" />
        <h1 className="auth-title">{mode === 'create' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-sub">{mode === 'create' ? 'Order ahead and skip the line.' : 'Sign in to order ahead.'}</p>

        <div className="auth-tabs" role="tablist">
          <button type="button" className={`auth-tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          <button type="button" className={`auth-tab ${mode === 'create' ? 'active' : ''}`} onClick={() => { setMode('create'); setError(''); }}>Create account</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'create' && (
            <>
              <input className="auth-input" placeholder="Full name" autoComplete="name" value={form.name} onChange={set('name')} required />
              <input className="auth-input" placeholder="Mobile number (for order texts)" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
            </>
          )}
          <input className="auth-input" placeholder="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={set('email')} required />
          <input className="auth-input" placeholder={mode === 'create' ? 'Password (8+ characters)' : 'Password'} type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required minLength={mode === 'create' ? 8 : undefined} />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'create' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button type="button" className="auth-guest" onClick={guest}>Continue as guest</button>

        <p className="auth-foot">
          Own a restaurant?{' '}
          <button type="button" className="auth-linkbtn" onClick={() => openInBrowser('/register')}>Partner with App-Thru</button>
        </p>
        <p className="auth-legal">
          By continuing you agree to our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

export function AccountPage() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(getCustomer());
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [msg, setMsg] = useState('');
  const signedIn = !!getCustomerToken();

  useEffect(() => {
    if (!signedIn) return;
    fetch('/api/customers/me', { headers: customerHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { setCustomer(d.customer); updateProfile(d.customer); setName(d.customer.name); setPhone(d.customer.phone || ''); })
      .catch(code => { if (code === 401) { signOut(); navigate('/signin', { replace: true }); } });
  }, [signedIn, navigate]);

  if (!signedIn) {
    return (
      <div className="account-page">
        <h1>Account</h1>
        <p className="account-muted">You're ordering as a guest.</p>
        <button className="auth-submit" onClick={() => { signOut(); navigate('/signin'); }}>Sign in or create account</button>
        <div className="account-links"><Link to="/support">Help &amp; support</Link> · <Link to="/privacy">Privacy</Link></div>
      </div>
    );
  }

  const save = async () => {
    setMsg('');
    const res = await fetch('/api/customers/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...customerHeaders() },
      body: JSON.stringify({ name, phone }),
    });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error || 'Could not save'); return; }
    updateProfile(d.customer); setCustomer(d.customer);
    try { localStorage.setItem('appthru_customer', JSON.stringify({ name: d.customer.name, phone: d.customer.phone })); } catch {}
    setMsg('Saved');
  };

  const del = async () => {
    if (!window.confirm('Delete your App-Thru account? This permanently removes your profile and sign-in. This cannot be undone.')) return;
    const res = await fetch('/api/customers/me', { method: 'DELETE', headers: customerHeaders() });
    if (res.ok) {
      signOut();
      try { localStorage.removeItem('appthru_customer'); } catch {}
      navigate('/signin', { replace: true });
    } else setMsg('Could not delete account — please contact support.');
  };

  return (
    <div className="account-page">
      <h1>Account</h1>
      <p className="account-muted">{customer?.email}</p>

      <label className="account-label">Name</label>
      <input className="auth-input" value={name} onChange={e => setName(e.target.value)} />
      <label className="account-label">Mobile number</label>
      <input className="auth-input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
      <button className="auth-submit" onClick={save}>Save changes</button>
      {msg && <p className="account-muted">{msg}</p>}

      <div className="account-section">
        <Link className="account-row" to="/orders">Your orders <span>›</span></Link>
        <Link className="account-row" to="/support">Help &amp; support <span>›</span></Link>
        <Link className="account-row" to="/privacy">Privacy policy <span>›</span></Link>
      </div>

      <button className="account-signout" onClick={() => { signOut(); navigate('/signin', { replace: true }); }}>Sign out</button>
      <button className="account-delete" onClick={del}>Delete account</button>
    </div>
  );
}
