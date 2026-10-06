# Rankaro — Full version (v4)

**What this is:** paste a website address → free technical SEO report in plain words
(English + Hinglish) → optional paid unlock (₹299) for premium data: keywords with
search volumes, competitors outranking you, backlink counts, AI-answer visibility.
Plus "Fix it for me" lead capture and WhatsApp report sharing.

**How the money works:** the technical audit is free and unlimited. The premium data
sections cost us ~₹8–25 per site (DataForSEO), so they're unlocked per-website with a
one-time ₹299 Razorpay (UPI/cards) payment. The pass is cryptographically signed,
lasts 7 days, and the unlocked report is cached in the visitor's browser — refreshes
cost us nothing. No database needed.

## Setup — keys (server settings only, never in the code)

Add these as **Environment Variables** in Vercel (Project → Settings → Environment
Variables) or Cloudflare (Workers & Pages → site → Settings → Environment Variables):

| Variable | Where to get it | Used for |
|---|---|---|
| `DATAFORSEO_API_KEY` | dataforseo.com → API dashboard. Format: `login:password` (paste both with the colon) | Keywords, competitors, backlinks, AI mentions |
| `RAZORPAY_KEY_ID` | razorpay.com dashboard → Settings → API Keys | Payment popup (public — also returned to the page) |
| `RAZORPAY_KEY_SECRET` | Same page (keep secret!) | Creating orders, verifying payments, signing passes |

Without keys, the site still works: free audit runs, and the unlock button shows
"coming soon". Nothing breaks.

**Price:** change `PRICE_INR` in `src/unlock.js` (default 299), then `node package.js`.

## Deploy on Cloudflare (free, for the real site)

1. Upload this folder to a GitHub repo.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → connect the repo.
3. Build settings: **no build command**, output directory: `/` (root).
4. Deploy. `functions/api/audit.js` → `/api/audit`, `functions/api/unlock.js` → `/api/unlock`.
5. Add the env vars above under Settings → Environment Variables.

## Deploy on Vercel (free, for testing only)

1. Upload to a GitHub repo → Vercel → Add New → Project → import → Deploy.
2. `api/audit.js` → `/api/audit`, `api/unlock.js` → `/api/unlock`.
3. Add the env vars above under Project → Settings → Environment Variables.
4. Note: Vercel's free plan is hobby-only — testing only, not the live business.

## Files

- `index.html`, `styles.css`, `app.js` — the website + Razorpay checkout + unlock flow.
- `functions/api/audit.js` — free technical-audit backend (Cloudflare).
- `functions/api/unlock.js` — orders + payment verify + premium data (Cloudflare).
- `api/audit.js`, `api/unlock.js` — same two backends for Vercel.
- `src/` — source files. The four backend files are generated from `src/`; edit there,
  then re-run `node package.js`. Never edit the generated files directly.

## How the unlock flow works (for developers)

1. Page loads → `POST /api/unlock {step:'config'}` → learns if payments are on.
2. "Unlock" click → `POST {step:'order', url}` → server creates a Razorpay order (₹299).
3. Razorpay popup (UPI/cards) → success returns order/payment IDs + signature.
4. `POST {step:'verify', ...}` → server checks HMAC-SHA256 signature with the secret.
   Only valid payments get a signed pass (HMAC of url|expiry, 7 days).
5. `POST {step:'data', pass, url, seed}` → server re-verifies the pass, calls
   DataForSEO (keyword ideas, live SERP, backlinks summary, LLM mentions — all in
   parallel, each best-effort), returns premium data.
6. Browser caches `{pass, exp, data}` per website in localStorage → refresh is free.

Security notes: secret keys never leave the server; the pass can't be forged without
`RAZORPAY_KEY_SECRET`; DataForSEO is only called after a verified payment or a valid
pass, so nobody can drain the data wallet for free.
