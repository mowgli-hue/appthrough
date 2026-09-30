// Order ids placed from THIS device (no accounts, so history is per-device)
const KEY = 'appthru_my_orders';

export function rememberOrder(id) {
  if (!id) return;
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!ids.includes(id)) ids.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 20)));
  } catch {}
}

export function myOrderIds() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
