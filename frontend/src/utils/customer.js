// Customer session (mobile app accounts). Stored on the device only.
import { Capacitor } from '@capacitor/core';

const TOKEN = 'appthru_customer_token';
const PROFILE = 'appthru_customer_profile';
const GUEST = 'appthru_guest';

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const isNativeApp = () => safe(() => Capacitor.isNativePlatform(), false);

export const getCustomerToken = () => safe(() => localStorage.getItem(TOKEN), null);
export const getCustomer = () => safe(() => JSON.parse(localStorage.getItem(PROFILE) || 'null'), null);
export const isGuest = () => safe(() => localStorage.getItem(GUEST) === '1', false);

export function saveSession({ token, customer }) {
  safe(() => {
    localStorage.setItem(TOKEN, token);
    localStorage.setItem(PROFILE, JSON.stringify(customer));
    localStorage.removeItem(GUEST);
    // keep checkout prefill in sync
    localStorage.setItem('appthru_customer', JSON.stringify({ name: customer.name, phone: customer.phone || '' }));
  });
}

export function updateProfile(customer) {
  safe(() => localStorage.setItem(PROFILE, JSON.stringify(customer)));
}

export function continueAsGuest() { safe(() => localStorage.setItem(GUEST, '1')); }

export function signOut() {
  safe(() => {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(PROFILE);
    localStorage.removeItem(GUEST);
  });
}

export const customerHeaders = () => {
  const t = getCustomerToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Restaurant/merchant pages always open in the phone's browser, not the app
export async function openInBrowser(path) {
  const url = path.startsWith('http') ? path : `https://www.appthru.ca${path}`;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {
    window.location.href = url;
  }
}
