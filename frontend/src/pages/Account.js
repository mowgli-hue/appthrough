import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { availableProviders, signInWith } from '../utils/social';
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
  const [providers, setProviders] = useState({ google: false, apple: false });
  useEffect(() => { availableProviders().then(setProviders).catch(() => {}); }, []);
  const social = async (provider) => {
    setError(''); setBusy(true);
    try {
      const data = await signInWith(provider);
      navigate(data.customer.phone ? '/' : '/account?welcome=1', { replace: true });
    } catch (err) {
      if (!/cancel/i.test(err.message || '')) setError(err.message || 'Sign-in failed');
    }
    setBusy(false);
  };

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

        {(providers.apple || providers.google) && (
          <div className="auth-social">
            {providers.apple && (
              <button type="button" className="social-btn social-apple" onClick={() => social('apple')} disabled={busy}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.37 12.8c-.02-2.18 1.78-3.23 1.86-3.28-1.02-1.49-2.6-1.69-3.16-1.71-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.84-.75-1.46.02-2.81.85-3.56 2.16-1.52 2.63-.39 6.52 1.09 8.66.72 1.04 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.48zM14.21 6.4c.6-.73 1.01-1.74.9-2.75-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.22z"/></svg>
                Continue with Apple
              </button>
            )}
            {providers.google && (
              <button type="button" className="social-btn social-google" onClick={() => social('google')} disabled={busy}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
                Continue with Google
              </button>
            )}
            <div className="pay-divider"><span>or use email</span></div>
          </div>
        )}

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
  const welcome = new URLSearchParams(useLocation().search).has('welcome');
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

  const since = customer?.since ? new Date(String(customer.since).replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';
  const ini = String(customer?.name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const viaLabel = customer?.provider === 'apple' ? 'Signed in with Apple' : customer?.provider === 'google' ? 'Signed in with Google' : 'Email account';

  return (
    <div className="account-page">
      <div className="profile-card">
        <div className="profile-avatar">
          {customer?.avatar ? <img src={customer.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{ini || '🙂'}</span>}
        </div>
        <div className="profile-info">
          <h1>{customer?.name}</h1>
          <p>{customer?.email && !/@users\.appthru\.ca$/.test(customer.email) ? customer.email : viaLabel}</p>
          <div className="profile-meta">
            <span>{viaLabel}</span>{since && <span>Member since {since}</span>}
          </div>
        </div>
      </div>

      {welcome && !customer?.phone && (
        <div className="profile-welcome">
          <strong>One last thing 👋</strong>
          <span>Add your mobile number so we can text you the moment your order is ready.</span>
        </div>
      )}

      <h2 className="account-h2">Your details</h2>
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
