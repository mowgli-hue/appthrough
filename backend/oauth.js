// Verifies Google / Apple identity tokens (RS256 JWTs) against the providers'
// published signing keys. No third-party libraries: Node's crypto does the work.
const crypto = require('crypto');

const PROVIDERS = {
  google: {
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    audiences: () => String(process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_WEB_CLIENT_ID || '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .concat(process.env.GOOGLE_IOS_CLIENT_ID ? [process.env.GOOGLE_IOS_CLIENT_ID.trim()] : []),
  },
  apple: {
    jwks: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences: () => String(process.env.APPLE_CLIENT_IDS || 'ca.appthru.app')
      .split(',').map(s => s.trim()).filter(Boolean),
  },
};

const keyCache = {}; // provider -> { at, keys }

async function getKeys(provider, force = false) {
  const c = keyCache[provider];
  if (!force && c && Date.now() - c.at < 60 * 60 * 1000) return c.keys;
  const res = await fetch(PROVIDERS[provider].jwks);
  if (!res.ok) throw new Error('Could not fetch signing keys');
  const { keys } = await res.json();
  keyCache[provider] = { at: Date.now(), keys };
  return keys;
}

const b64urlJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function verifyIdToken(provider, token) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error('Unknown sign-in provider');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('Unsupported token');

  let keys = await getKeys(provider);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { keys = await getKeys(provider, true); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('Unknown signing key');

  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), pub, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('Bad token signature');

  const now = Math.floor(Date.now() / 1000);
  if (!cfg.issuers.includes(payload.iss)) throw new Error('Wrong token issuer');
  const auds = cfg.audiences();
  if (!auds.length) throw new Error(`${provider} sign-in is not configured`);
  const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!tokenAud.some(a => auds.includes(a))) throw new Error('Token not issued for this app');
  if (!payload.exp || payload.exp < now - 60) throw new Error('Token expired');
  if (!payload.sub) throw new Error('Token missing subject');

  const verified = payload.email_verified === true || payload.email_verified === 'true';
  return { sub: String(payload.sub), email: payload.email ? String(payload.email).toLowerCase() : null, emailVerified: verified, name: payload.name || null, picture: payload.picture || null };
}

function publicConfig() {
  return {
    google: {
      enabled: PROVIDERS.google.audiences().length > 0,
      webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
    },
    apple: { enabled: process.env.APPLE_SIGNIN_ENABLED !== '0' },
  };
}

module.exports = { verifyIdToken, publicConfig };
