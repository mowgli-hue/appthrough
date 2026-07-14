// Merchant session helpers — token issued by /api/auth/login or /api/merchants/register
const TOKEN_KEY = 'appthru_token';
const RESTAURANT_KEY = 'appthru_restaurant_id';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRestaurantId() {
  return localStorage.getItem(RESTAURANT_KEY);
}

export function saveSession(token, restaurantId) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (restaurantId) localStorage.setItem(RESTAURANT_KEY, restaurantId);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(RESTAURANT_KEY);
}

// Spread into fetch headers: { 'Content-Type': ..., ...authHeaders() }
export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
