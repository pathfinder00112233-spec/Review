# Rankaro — Demo (v1)

**What this is:** a working demo. A visitor pastes a website address → gets a real,
live SEO report in plain words (English + Hinglish toggle) → can tap "Fix it for me".

**What works with zero keys:**
- Full technical audit (titles, meta, headings, images, speed, mobile, sitemap…) — runs live.
- Google PageSpeed mobile score (best-effort; works when Google's free quota allows).

**What's stubbed:** Keywords, Competitors, and AI-visibility cards show as "locked" —
they activate in the full version once a `DATAFORSEO_API_KEY` is added.

## Deploy on Cloudflare (free, for the real site)

1. Upload this folder to a GitHub repo.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → connect the repo.
3. Build settings: **no build command**, output directory: `/` (root).
4. Deploy. The file `functions/api/audit.js` becomes your `/api/audit` backend automatically.
5. (Later) Add secret keys: Workers & Pages → your site → **Settings → Environment Variables**.

## Deploy on Vercel (free, for testing only)

1. Upload this folder to a GitHub repo.
2. Vercel → **Add New → Project** → import the repo → Deploy.
3. The file `api/audit.js` becomes your `/api/audit` backend automatically.
4. Note: Vercel's free plan is hobby-only — use it for testing, not the live business.

## Files

- `index.html`, `styles.css`, `app.js` — the website.
- `functions/api/audit.js` — backend for Cloudflare.
- `api/audit.js` — backend for Vercel.
- `src/` — source files (the two backend files are generated from these; edit here, re-run `node package.js`).

## For developers

- `node package.js` regenerates the deploy files from `src/`.
- Test the engine locally: `node test-local.mjs https://example.com`
