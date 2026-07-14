// Menu import: fetch a menu web page or parse an uploaded PDF, then extract
// menu items heuristically (name + price + category). Results are meant to
// PRE-FILL the merchant's menu editor — the merchant reviews before saving.
// pdfjs-dist legacy build works in Node without a worker
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const PRICE_RE = /(?:\$|USD\s?)?(\d{1,3}(?:\.\d{2}))(?!\d)/;
const MAX_ITEMS = 120;

// Lines that look like section headers: short, no price, mostly letters
function looksLikeCategory(line) {
  if (line.length < 3 || line.length > 32) return false;
  if (PRICE_RE.test(line)) return false;
  if (/\d/.test(line)) return false;
  const letters = line.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  // ALL CAPS, Title Case single/double word, or ends with ':'
  return line === line.toUpperCase() || /^[A-Z][a-z]+( [A-Z&][a-z]*)?:?$/.test(line.trim());
}

function cleanName(raw) {
  return raw
    .replace(/[.·•⋯_\-–—]{2,}/g, ' ')  // dot leaders: "Burger....... 9.99"
    .replace(/[\s:;,]+$/g, '')
    .replace(/^\W+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractItems(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let category = 'Main';

  for (const line of lines) {
    if (looksLikeCategory(line)) {
      const cat = cleanName(line.replace(/:$/, ''));
      if (cat) category = cat.length > 24 ? cat.slice(0, 24) : cat;
      continue;
    }

    const m = line.match(PRICE_RE);
    if (!m) continue;
    const price = parseFloat(m[1]);
    if (!(price >= 0.5 && price <= 500)) continue;

    // Name = text before the price occurrence
    let name = cleanName(line.slice(0, m.index));
    if (name.length < 2 || name.length > 80) continue;
    if (/^(total|subtotal|tax|tip|delivery|minimum)/i.test(name)) continue;

    // "Name — description" or "Name - description" → split
    let description = '';
    const dash = name.split(/\s+[—–-]\s+/);
    if (dash.length > 1) {
      name = dash[0].trim();
      description = dash.slice(1).join(', ').trim();
    }

    items.push({ name, price, category, description, popular: false });
    if (items.length >= MAX_ITEMS) break;
  }

  // De-duplicate by name (keep first)
  const seen = new Set();
  return items.filter(i => {
    const k = i.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

// Basic SSRF guard: public http(s) hosts only
function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false;
  }
  if (host === '::1' || host.startsWith('fd') || host.startsWith('fe80')) return false;
  return true;
}

async function importFromUrl(url) {
  if (!isSafeUrl(url)) throw new Error('Please provide a public http(s) menu URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'AppThru-MenuImport/1.0' },
    });
    if (!res.ok) throw new Error(`Could not fetch that page (HTTP ${res.status})`);
    const type = res.headers.get('content-type') || '';
    if (type.includes('pdf')) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 15 * 1024 * 1024) throw new Error('PDF is too large (max 15 MB)');
      return importFromPdf(buf);
    }
    let html = await res.text();
    if (html.length > 3 * 1024 * 1024) html = html.slice(0, 3 * 1024 * 1024);
    const items = extractItems(htmlToText(html));
    return { items, source: 'url' };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('That page took too long to load');
    if (e.message === 'fetch failed') throw new Error('Could not reach that URL — check the address and try again');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function importFromPdf(buffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  let text = '';
  const pages = Math.min(doc.numPages, 20);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items by their y position so each visual line becomes one text line
    const rows = new Map();
    for (const it of content.items) {
      const y = Math.round(it.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], str: it.str });
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(p2 => p2.str).join(' '));
    text += lines.join('\n') + '\n';
  }
  const items = extractItems(text);
  return { items, source: 'pdf' };
}

module.exports = { importFromUrl, importFromPdf, extractItems };
