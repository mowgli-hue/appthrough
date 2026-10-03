// Sign in with Google / Apple. Native (iOS/Android) uses the device's own
// sign-in sheets; web uses Google's button flow. Tokens are verified server-side.
import { Capacitor } from '@capacitor/core';
import { saveSession } from './customer';

let cfgPromise = null;
let initialized = false;

export function getSocialConfig() {
  if (!cfgPromise) {
    cfgPromise = fetch('/api/auth/social-config').then(r => r.json()).catch(() => ({ google: {}, apple: {} }));
  }
  return cfgPromise;
}

export const platform = () => { try { return Capacitor.getPlatform(); } catch { return 'web'; } };

// Which buttons to show on this device
export async function availableProviders() {
  const cfg = await getSocialConfig();
  const p = platform();
  const google = !!cfg.google?.enabled && (
    p === 'ios' ? !!cfg.google.iosClientId
      : p === 'android' ? !!cfg.google.androidEnabled && !!cfg.google.webClientId
        : !!cfg.google.webClientId);
  const apple = !!cfg.apple?.enabled && p === 'ios';
  return { google, apple };
}

async function ensureInit() {
  if (initialized) return;
  const cfg = await getSocialConfig();
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  const opts = {};
  if (cfg.google?.enabled) {
    opts.google = {
      webClientId: cfg.google.webClientId || undefined,
      iOSClientId: cfg.google.iosClientId || undefined,
      iOSServerClientId: cfg.google.webClientId || undefined,
      mode: 'online',
    };
  }
  if (cfg.apple?.enabled && platform() === 'ios') opts.apple = { clientId: 'ca.appthru.app' };
  await SocialLogin.initialize(opts);
  initialized = true;
}

export async function signInWith(provider) {
  await ensureInit();
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  const res = await SocialLogin.login({
    provider,
    options: provider === 'google' ? { scopes: ['email', 'profile'] } : { scopes: ['name', 'email'] },
  });
  const r = res?.result || {};
  const idToken = r.idToken || r.identityToken;
  if (!idToken) throw new Error('Sign-in was cancelled');
  const p = r.profile || {};
  const name = [p.givenName, p.familyName].filter(Boolean).join(' ') || p.name || '';
  const out = await fetch('/api/customers/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, idToken, name }),
  });
  const data = await out.json();
  if (!out.ok) throw new Error(data.error || 'Sign-in failed');
  saveSession(data);
  return data;
}
