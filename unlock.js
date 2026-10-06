/* ============================================================
 * Rankaro unlock backend (full version)
 * Razorpay order creation + payment verification + signed
 * 7-day passes + DataForSEO premium data (keywords,
 * competitors, backlinks, AI mentions).
 *
 * Zero dependencies. Web Crypto for HMAC. Runs in
 * Cloudflare Workers, Vercel serverless, or Node 18+.
 *
 * Env vars needed (server settings only, never frontend):
 *   RAZORPAY_KEY_ID       - Razorpay public key id
 *   RAZORPAY_KEY_SECRET    - Razorpay secret (orders + verify + pass signing)
 *   DATAFORSEO_API_KEY     - "login:password" from dataforseo.com
 * ============================================================ */

'use strict';

const PRICE_INR = 299;
const PASS_DAYS = 7;
const DFS_LOCATION = 2840; // India — verify against DataForSEO docs at launch
const DFS_LANG = 'en';
const DFS_TIMEOUT = 25000;

/* ---------------- crypto helpers (Web Crypto, works everywhere) ---------------- */

async function hmacHex(key, msg) {
  const enc = new TextEncoder();
  const ck = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', ck, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64urlEncode(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

/* ---------------- signed pass ---------------- */

async function makePass(url, secret) {
  const exp = Date.now() + PASS_DAYS * 86400000;
  const payload = url + '|' + exp;
  const sig = await hmacHex(secret, payload);
  return { pass: b64urlEncode(payload) + '.' + sig, exp };
}

async function checkPass(pass, url, secret) {
  try {
    const parts = String(pass).split('.');
    if (parts.length !== 2) return { ok: false, error: 'Invalid pass.' };
    const payload = b64urlDecode(parts[0]);
    const sep = payload.lastIndexOf('|');
    if (sep < 0) return { ok: false, error: 'Invalid pass.' };
    const pUrl = payload.slice(0, sep);
    const exp = Number(payload.slice(sep + 1));
    if (pUrl !== url) return { ok: false, error: 'This pass is for a different website.' };
    if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false, error: 'This pass has expired.' };
    const sig = await hmacHex(secret, payload);
    if (!safeEqual(sig, parts[1])) return { ok: false, error: 'Invalid pass.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Invalid pass.' };
  }
}

/* ---------------- DataForSEO ---------------- */

async function dfs(path, dfsKey, payload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DFS_TIMEOUT);
  try {
    const r = await fetch('https://api.dataforseo.com' + path, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': 'Basic ' + btoa(dfsKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function firstResult(json) {
  try {
    const t = json && json.tasks && json.tasks[0];
    if (!t || t.status_code !== 20000) return null;
    return t.result;
  } catch { return null; }
}

function parseKeywords(json) {
  const res = firstResult(json);
  if (!res) return { ok: false };
  const arr = Array.isArray(res) ? res : [];
  const items = arr.slice(0, 10).map(k => ({
    kw: k.keyword || '',
    vol: (k.search_volume == null ? (k.keyword_info && k.keyword_info.search_volume) : k.search_volume) || null,
    comp: k.competition || (k.keyword_info && k.keyword_info.competition) || null,
  })).filter(k => k.kw);
  return { ok: items.length > 0, items };
}

function parseCompetitors(json, ownHost) {
  const res = firstResult(json);
  if (!res) return { ok: false };
  const r0 = Array.isArray(res) ? res[0] : res;
  const items = ((r0 && r0.items) || []).filter(i => i.type === 'organic');
  const list = [];
  for (const i of items) {
    let host = '';
    try { host = new URL(i.url).hostname.replace(/^www\./, ''); } catch {}
    if (host && host === ownHost) continue;
    list.push({ pos: i.rank_absolute || i.rank_group || null, title: i.title || '', domain: host || i.domain || '' });
    if (list.length >= 6) break;
  }
  return { ok: list.length > 0, items: list };
}

function parseBacklinks(json) {
  const res = firstResult(json);
  if (!res) return { ok: false };
  const r0 = Array.isArray(res) ? res[0] : res;
  if (!r0) return { ok: false };
  const refDoms = r0.referring_domains ?? r0.referring_domains_count ?? null;
  const bl = r0.backlinks ?? r0.backlinks_count ?? r0.total_backlinks ?? null;
  if (refDoms == null && bl == null) return { ok: false };
  return { ok: true, referringDomains: refDoms, backlinks: bl };
}

function parseAiMentions(json) {
  const res = firstResult(json);
  if (!res) return { ok: false };
  const r0 = Array.isArray(res) ? res[0] : res;
  if (!r0) return { ok: false };
  const items = r0.items || r0.mentions || [];
  return { ok: true, mentions: Array.isArray(items) ? items.length : 0 };
}

function brandFromUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return h.split('.')[0].replace(/[^a-z0-9]/g, '');
  } catch { return ''; }
}

async function fetchPremiumData(url, seed, dfsKey) {
  let ownHost = '';
  try { ownHost = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  const brand = brandFromUrl(url);

  const kwP = dfs('/v3/dataforseo_labs/google/keyword_ideas/live', dfsKey,
    [{ keyword: seed, location_code: DFS_LOCATION, language_code: DFS_LANG, limit: 12, include_seed_keyword: true }]);
  const serpP = dfs('/v3/serp/google/organic/live/advanced', dfsKey,
    [{ keyword: seed, location_code: DFS_LOCATION, language_code: DFS_LANG, device: 'desktop', depth: 10 }]);
  const blP = dfs('/v3/backlinks/summary/live', dfsKey,
    [{ target: ownHost, include_subdomains: true }]);
  const aiP = brand
    ? dfs('/v3/ai_optimization/llm_mentions/search/live', dfsKey, [{ keyword: brand }])
    : Promise.resolve(null);

  const [kwR, serpR, blR, aiR] = await Promise.all([kwP, serpP, blP, aiP]);

  return {
    seed,
    keywords: parseKeywords(kwR),
    competitors: parseCompetitors(serpR, ownHost),
    backlinks: parseBacklinks(blR),
    ai: parseAiMentions(aiR),
    fetchedAt: Date.now(),
  };
}

/* ---------------- main handler ----------------
 * request: { method, json() }   env: { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, DATAFORSEO_API_KEY }
 * returns: { status, body }
 */
async function handleUnlock(request, env) {
  const ok = (body, status) => ({ status: status || 200, body });
  const bad = (error, status) => ({ status: status || 400, body: { ok: false, error } });
  env = env || {};

  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  const dfsKey = String(env.DATAFORSEO_API_KEY || '').trim();

  if (request.method === 'GET') {
    return ok({ ok: true, paymentsOn: !!keyId, keyId: keyId || null, price: PRICE_INR });
  }
  if (request.method !== 'POST') return bad('Method not allowed', 405);

  let body = {};
  try { body = await request.json(); } catch { return bad('Bad request'); }
  const step = body.step;

  if (step === 'config') {
    return ok({ ok: true, paymentsOn: !!(keyId && keySecret), keyId: keyId || null, price: PRICE_INR });
  }

  if (step === 'order') {
    if (!keyId || !keySecret) return bad('Payments are not connected yet.');
    const url = String(body.url || '').slice(0, 300);
    if (!url) return bad('Missing website URL.');
    let resp;
    try {
      resp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(keyId + ':' + keySecret),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: PRICE_INR * 100,
          currency: 'INR',
          receipt: 'rk_' + Date.now().toString(36),
          notes: { url: url.slice(0, 100) },
        }),
      });
    } catch { return bad('Could not reach the payment server. Try again.'); }
    if (!resp.ok) return bad('Could not start payment. Please try again.');
    let order = {};
    try { order = await resp.json(); } catch { return bad('Could not start payment. Please try again.'); }
    if (!order.id) return bad('Could not start payment. Please try again.');
    return ok({ ok: true, orderId: order.id, amount: order.amount, keyId });
  }

  if (step === 'verify') {
    const orderId = String(body.orderId || '');
    const paymentId = String(body.paymentId || '');
    const signature = String(body.signature || '');
    const url = String(body.url || '').slice(0, 300);
    if (!orderId || !paymentId || !signature || !url) return bad('Missing payment details.');
    if (!keySecret) return bad('Payments are not connected yet.');
    const expected = await hmacHex(keySecret, orderId + '|' + paymentId);
    if (!safeEqual(expected, signature)) return bad('Payment verification failed.', 402);
    const { pass, exp } = await makePass(url, keySecret);
    return ok({ ok: true, pass, exp });
  }

  if (step === 'data') {
    const pass = String(body.pass || '');
    const url = String(body.url || '').slice(0, 300);
    const seed = String(body.seed || '').slice(0, 80);
    if (!pass || !url) return bad('Missing pass.');
    if (!keySecret) return bad('Payments are not connected yet.');
    const chk = await checkPass(pass, url, keySecret);
    if (!chk.ok) return bad(chk.error, 403);
    if (!dfsKey) return bad('Data key is not connected yet.');
    const data = await fetchPremiumData(url, seed, dfsKey);
    return ok({ ok: true, data });
  }

  return bad('Unknown step');
}

/* Vercel Serverless Function -> route /api/unlock
 * (Generated at package time: src/unlock.js is inlined above.) */
export default async function handler(req, res) {
  try {
    const out = await handleUnlock(
      { method: req.method, json: async () => (req.body || {}) },
      process.env
    );
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'no-store');
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}
