// Timestamps are stored in UTC (SQLite CURRENT_TIMESTAMP). These helpers
// parse them as UTC and always display Pacific (Vancouver) time.
const TZ = 'America/Vancouver';

export function parseDbDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const s = String(ts);
  // "2026-09-13 21:30:00" (no zone) -> treat as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z');
  }
  return new Date(s);
}

export function formatTime(ts) {
  const d = parseDbDate(ts);
  if (!d || isNaN(d)) return '';
  return d.toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

export function formatDate(ts) {
  const d = parseDbDate(ts);
  if (!d || isNaN(d)) return '';
  return d.toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
