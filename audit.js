/* ============================================================
 * Rankaro demo audit engine (v1)
 * Zero dependencies. Runs in Cloudflare Workers, Vercel
 * serverless functions, or plain Node 18+.
 *
 * Approach inspired by OpenSEO (MIT, (c) 2026 Ben Senescu)
 * - see NOTICE. Implemented fresh, dependency-free, for the
 * Rankaro demo scope: single-page audit, no database.
 * ============================================================ */

'use strict';

const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 1_000_000; // 1MB HTML cap
const MAX_REDIRECTS = 5;
const USER_AGENT = 'RankaroBot/1.0 (demo audit; +https://rankaro.com)';

/* ---------------- URL safety (SSRF guards) ---------------- */

function isIPv4(s) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.some(n => n < 0 || n > 255 || !Number.isInteger(n))) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function inRange(ip, cidr, mask) {
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(cidr);
  if (a === null || b === null) return false;
  const m = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  return (a & m) === (b & m);
}

// Conservative private/special range list for IPv4 literals.
function isPrivateIPv4(ip) {
  return (
    inRange(ip, '0.0.0.0', 8) ||        // "this network"
    inRange(ip, '10.0.0.0', 8) ||       // private
    inRange(ip, '100.64.0.0', 10) ||    // CGNAT
    inRange(ip, '127.0.0.0', 8) ||      // loopback
    inRange(ip, '169.254.0.0', 16) ||   // link-local (cloud metadata lives here)
    inRange(ip, '172.16.0.0', 12) ||    // private
    inRange(ip, '192.0.2.0', 24) ||     // TEST-NET
    inRange(ip, '192.168.0.0', 16) ||   // private
    inRange(ip, '198.18.0.0', 15) ||    // benchmark
    inRange(ip, '198.51.100.0', 24) ||  // TEST-NET-2
    inRange(ip, '203.0.113.0', 24)      // TEST-NET-3
  );
}

function isPrivateIPv6(ip) {
  const h = ip.toLowerCase();
  return (
    h === '::1' || h === '::' ||
    h.startsWith('fc') || h.startsWith('fd') || // unique local
    h.startsWith('fe80') || h.startsWith('fe90') || h.startsWith('fea') || h.startsWith('feb') || // link-local
    h.startsWith('::ffff:') // mapped IPv4 -> check inner below by caller convention; block outright
  );
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.internal', '.local', '.invalid', '.test'];
const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
  '169.254.169.254', // AWS/GCP metadata
  '100.100.100.200', // Alibaba metadata
]);

function assertPublicUrl(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw friendlyError('That does not look like a valid website address.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw friendlyError('Only http and https websites can be checked.');
  }
  let host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  if (BLOCKED_HOSTS.has(host)) throw friendlyError('This address is not allowed.');
  if (BLOCKED_HOST_SUFFIXES.some(s => host.endsWith(s))) throw friendlyError('This address is not allowed.');

  if (isIPv4(host)) {
    if (isPrivateIPv4(host)) throw friendlyError('This address is not allowed.');
  } else if (host.includes(':')) {
    if (isPrivateIPv6(host)) throw friendlyError('This address is not allowed.');
  }
  // Note: hostnames that *resolve* to private IPs (DNS rebinding) are not
  // resolved here; production should add DNS re-validation per redirect hop.
  return u.toString();
}

function friendlyError(message) {
  const e = new Error(message);
  e.isFriendly = true;
  return e;
}

/* ---------------- fetching ---------------- */

async function readCapped(body, maxBytes) {
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  const decoder = new TextDecoder('utf-8');
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      // keep what we have; page is huge, analysis continues on partial HTML
      try { await reader.cancel(); } catch {}
      break;
    }
    chunks.push(value);
  }
  for (const c of chunks) text += decoder.decode(c, { stream: true });
  text += decoder.decode();
  return text;
}

async function fetchWithTimeout(url, ms, extraHeaders) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { 'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml', ...(extraHeaders || {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchPageGuarded(startUrl) {
  let url = assertPublicUrl(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let resp;
    const t0 = Date.now();
    try {
      resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    } catch (e) {
      if (e && e.name === 'AbortError') throw friendlyError('The website took too long to respond (over 15 seconds).');
      throw friendlyError('Could not reach the website. Check the address and try again.');
    }
    const ms = Date.now() - t0;
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const loc = resp.headers.get('location');
      try { await resp.body?.cancel(); } catch {}
      if (!loc) throw friendlyError('The website redirected us to nowhere. Stopping.');
      url = assertPublicUrl(new URL(loc, url).toString()); // re-validate every hop
      continue;
    }
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      try { await resp.body?.cancel(); } catch {}
      throw friendlyError('That address did not return a web page (we need HTML).');
    }
    const html = await readCapped(resp.body, MAX_BYTES);
    return { url, finalUrl: url, status: resp.status, html, ms, truncated: html.length >= MAX_BYTES };
  }
  throw friendlyError('Too many redirects. Stopping.');
}

async function fetchTextBestEffort(url, ms) {
  try {
    const resp = await fetchWithTimeout(url, ms || 8000);
    if (!resp.ok) return null;
    return await readCapped(resp.body, 200_000);
  } catch {
    return null;
  }
}

/* ---------------- HTML extraction (regex, dependency-free) ---------------- */

function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function getTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

function getMetaByName(html, name) {
  const re = new RegExp('<meta[^>]+(?:name|property)=["\']' + name + '["\'][^>]*>', 'i');
  const tag = html.match(re);
  if (!tag) return '';
  const c = tag[0].match(/content=["']([\s\S]*?)["']/i);
  return c ? decodeEntities(c[1]).replace(/\s+/g, ' ').trim() : '';
}

function getCanonical(html, pageUrl) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  if (!m) return '';
  const h = m[0].match(/href=["']([^"']+)["']/i);
  if (!h) return '';
  try { return new URL(h[1], pageUrl).toString(); } catch { return h[1]; }
}

function getHtmlLang(html) {
  const m = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return m ? m[1].trim() : '';
}

function hasViewport(html) {
  return /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
}

function getHeadings(html) {
  return [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(m => Number(m[1]));
}

function getImages(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
}

function countMissingAlt(imgTags) {
  return imgTags.filter(t => {
    const m = t.match(/\balt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!m) return true;
    const v = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    return v.length === 0;
  }).length;
}

function visibleText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t).replace(/\s+/g, ' ').trim();
  return t;
}

function getLinks(html, pageUrl) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#\s][^"']*)["'][^>]*>/gi)) {
    try {
      const u = new URL(m[1], pageUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.push(u);
    } catch {}
  }
  return out;
}

/* ---------------- checks ---------------- */

function addIssue(list, id, severity, title, what, fix, what_hi, fix_hi, detail) {
  list.push({ id, severity, title, what, fix, what_hi, fix_hi, detail: detail || '' });
}

function runChecks(page, stats) {
  const issues = [];
  const passed = [];
  const { html, finalUrl, ms } = page;

  const title = getTitle(html);
  const metaDesc = getMetaByName(html, 'description');
  const robotsMeta = getMetaByName(html, 'robots').toLowerCase();
  const canonical = getCanonical(html, finalUrl);
  const lang = getHtmlLang(html);
  const viewport = hasViewport(html);
  const headings = getHeadings(html);
  const h1Count = headings.filter(h => h === 1).length;
  const imgs = getImages(html);
  const missingAlt = countMissingAlt(imgs);
  const words = visibleText(html).split(' ').filter(Boolean).length;
  const links = getLinks(html, finalUrl);
  const origin = new URL(finalUrl).origin;
  const internal = links.filter(l => l.origin === origin).length;
  const external = links.length - internal;
  const isHttps = finalUrl.startsWith('https:');
  const ogTitle = getMetaByName(html, 'og:title');

  Object.assign(stats, {
    title, titleLen: [...title].length, metaLen: [...metaDesc].length,
    h1Count, words, images: imgs.length, imagesMissingAlt: missingAlt,
    loadMs: ms, https: isHttps, internalLinks: internal, externalLinks: external,
    hasLang: !!lang, hasViewport: viewport,
  });

  // --- title ---
  if (!title) {
    addIssue(issues, 'missing-title', 'critical', 'Page has no title',
      'Your page has no title. The title is the blue clickable line people see on Google — without it, Google invents one, usually a bad one.',
      'Add a <title> tag inside <head>. Keep it under 60 characters and put your main keyword near the start. Example: "Best Dentist in Rohtak | Mint Clinic".',
      'Aapke page ka title hi nahi hai. Title woh blue line hai jo Google me dikhti hai — bina title ke Google khud kuch laga dega, jo usually bekaar hota hai.',
      '<head> me <title> tag lagao. 60 characters se chhota rakho, main keyword shuru me likho. Example: "Best Dentist in Rohtak | Mint Clinic".');
  } else if ([...title].length > 60) {
    addIssue(issues, 'title-too-long', 'warning', 'Title is too long (' + [...title].length + ' characters)',
      'Google only shows about 60 characters of your title. Yours gets cut off mid-sentence, so visitors see an unfinished thought.',
      'Shorten the title to under 60 characters. Keep the most important words at the beginning.',
      'Aapka title bahut lamba hai (' + [...title].length + ' characters). Google sirf 60 characters dikhata hai — baaki cut jaata hai.',
      'Title ko 60 characters se chhota karo. Sabse important shabd shuru me rakho.');
  } else if ([...title].length < 30) {
    addIssue(issues, 'title-too-short', 'warning', 'Title is very short (' + [...title].length + ' characters)',
      'Your title is so short it wastes space Google gives you to attract clicks. Competitors use the full space.',
      'Expand the title to 50–60 characters: add your main service + city. Example: "Root Canal Treatment in Rohtak | Mint Clinic".',
      'Aapka title bahut chhota hai. Google jitni jagah deta hai, uska fayda nahi utha rahe.',
      'Title ko 50–60 characters tak badhao: main service + city add karo.');
  } else {
    passed.push('Page title looks good (' + [...title].length + ' characters).');
  }

  // --- meta description ---
  if (!metaDesc) {
    addIssue(issues, 'missing-meta-description', 'critical', 'Missing meta description',
      'Under your Google title there is a 2-line summary of the page. Yours is empty, so Google picks random text — usually uninviting.',
      'Add <meta name="description" content="..."> in <head>. Write 120–160 characters like a mini-ad: what you offer + city + why choose you.',
      'Google me title ke neeche 2-line summary aata hai. Aapka khaali hai, isliye Google random text utha lega.',
      '<head> me meta description add karo (120–160 characters). Mini-ad ki tarah likho: kya offer hai + city + aapko kyun choose karein.');
  } else if ([...metaDesc].length > 160 || [...metaDesc].length < 70) {
    addIssue(issues, 'meta-description-length', 'warning', 'Meta description is ' + [...metaDesc].length + ' characters (aim for 120–160)',
      'Too short and it looks empty on Google; too long and it gets cut off with "...".',
      'Rewrite it to 120–160 characters. One clear sentence about the page + a reason to click.',
      'Meta description ya to bahut chhoti hai ya bahut lambi — dono me nuksaan hai.',
      'Ise 120–160 characters me likho. Ek clear line page ke baare me + click karne ki wajah.');
  } else {
    passed.push('Meta description is a good length (' + [...metaDesc].length + ' characters).');
  }

  // --- H1 ---
  if (h1Count === 0) {
    addIssue(issues, 'missing-h1', 'critical', 'Page has no main heading (H1)',
      'Every page needs one big main heading that says what the page is about. Yours has none, so Google has to guess the topic.',
      'Add exactly one <h1> near the top of the page with your main keyword. Example: "Dentist in Rohtak".',
      'Har page me ek bada main heading (H1) hona chahiye jo bataye page kis baare me hai. Aapke page me hai hi nahi.',
      'Page ke top par exactly ek <h1> lagao, main keyword ke saath. Example: "Dentist in Rohtak".');
  } else if (h1Count > 1) {
    addIssue(issues, 'multiple-h1', 'warning', h1Count + ' main headings found (keep just one)',
      'You have ' + h1Count + ' H1 headings. That confuses Google about which one is the real topic of the page.',
      'Keep one H1. Change the others to H2.',
      'Aapke page me ' + h1Count + ' H1 headings hain. Google confuse ho jaata hai ki asli topic kaunsa hai.',
      'Sirf ek H1 rakho. Baakiyon ko H2 bana do.');
  } else {
    passed.push('Exactly one main heading (H1) — correct.');
  }

  // --- heading order ---
  let skip = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) { skip = true; break; }
  }
  if (skip) {
    addIssue(issues, 'heading-skip', 'warning', 'Headings jump levels (e.g. H1 straight to H3)',
      'Your headings skip levels, like going from H1 directly to H3. Screen readers and Google prefer a clean ladder: H1 → H2 → H3.',
      'Fix the order so headings step down one level at a time.',
      'Aapki headings level skip kar rahi hain (jaise H1 ke baad seedha H3).',
      'Order theek karo: H1 → H2 → H3, ek-ek step neeche.');
  }

  // --- images ---
  if (imgs.length > 0 && missingAlt > 0) {
    const pct = Math.round((missingAlt / imgs.length) * 100);
    addIssue(issues, 'images-missing-alt', 'warning', missingAlt + ' of ' + imgs.length + ' images have no description (' + pct + '%)',
      'Google cannot "see" images. The alt text tells it what the image shows. ' + missingAlt + ' of your images have no alt text, so they are invisible to image search.',
      'Add a short alt="..." description to every <img>. Describe what is in the picture, e.g. alt="Dentist treating patient in Rohtak clinic".',
      'Google images ko "dekh" nahi sakta. Alt text batata hai image me kya hai. Aapki ' + missingAlt + ' images me alt text nahi hai.',
      'Har <img> me chhota alt="..." description likho, jaise alt="Dentist treating patient in Rohtak clinic".');
  } else if (imgs.length > 0) {
    passed.push('All ' + imgs.length + ' images have descriptions (alt text).');
  }

  // --- thin content ---
  if (words < 150) {
    addIssue(issues, 'thin-content', 'warning', 'Page has very little text (' + words + ' words)',
      'Your page has only ' + words + ' words of readable text. Google struggles to understand — and rank — pages with almost no content.',
      'Add helpful text: describe your services, answer common questions, add an FAQ section. Aim for at least 300+ words on important pages.',
      'Aapke page me sirf ' + words + ' shabd hain. Itne kam text me Google samajh nahi paata page kis baare me hai.',
      'Helpful text add karo: services describe karo, common questions ke jawab do, FAQ section lagao. Important pages par 300+ shabd rakho.');
  } else {
    passed.push('Good amount of text content (' + words + ' words).');
  }

  // --- noindex ---
  if (/\bnoindex\b/.test(robotsMeta)) {
    addIssue(issues, 'noindex', 'critical', 'Page tells Google NOT to show it (noindex)',
      'Your page contains a "noindex" instruction — you are literally telling Google to hide this page from search results.',
      'Remove the noindex from the robots meta tag (or robots.txt) unless you truly want this page hidden.',
      'Aapke page me "noindex" laga hai — matlab aap khud Google ko keh rahe ho is page ko mat dikhao.',
      'Robots meta tag se noindex hatao, jab tak page ko chhupana hi maksad na ho.');
  }

  // --- canonical ---
  if (!canonical) {
    addIssue(issues, 'missing-canonical', 'warning', 'No canonical address set',
      'The canonical tag tells Google which address is the "official" one when the same content can be reached by multiple URLs. Without it, Google may split your ranking power across duplicates.',
      'Add <link rel="canonical" href="PAGE-URL"> in <head> with the page\'s own full address.',
      'Canonical tag nahi hai. Ye Google ko batata hai kaunsa address "asli" hai jab same content kai URLs par khule.',
      '<head> me <link rel="canonical" href="PAGE-URL"> lagao, page ke apne full address ke saath.');
  } else {
    passed.push('Canonical address is set correctly.');
  }

  // --- mobile viewport ---
  if (!viewport) {
    addIssue(issues, 'missing-viewport', 'critical', 'Not mobile-friendly (no viewport tag)',
      'Your page has no viewport tag, so on phones it will look tiny and broken. Most of your visitors are on mobile — Google also ranks mobile-friendly pages higher.',
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>, and make sure the design adapts to small screens.',
      'Aapke page me viewport tag nahi hai — phone par page chhota-toota dikhega. Aajkal zyadatar visitors mobile se aate hain.',
      '<head> me viewport meta tag lagao aur design ko mobile-friendly banao.');
  } else {
    passed.push('Mobile viewport tag is present.');
  }

  // --- lang ---
  if (!lang) {
    addIssue(issues, 'missing-lang', 'warning', 'Page language not declared',
      'The <html> tag does not say which language the page is in. Declaring it helps Google and screen readers handle your content correctly.',
      'Add lang="en" (or "hi") to your <html> tag: <html lang="en">.',
      '<html> tag me language declare nahi hai.',
      '<html lang="en"> (ya "hi") lagao.');
  }

  // --- https ---
  if (!isHttps) {
    addIssue(issues, 'not-https', 'critical', 'Website is not secure (no HTTPS)',
      'Your site still uses plain http. Browsers show visitors a "Not Secure" warning, which scares people away — and Google ranks secure sites higher.',
      'Install an SSL certificate (most hosts give it free — look for "Let\'s Encrypt") and redirect all http traffic to https.',
      'Aapki site secure nahi hai (http). Browser "Not Secure" warning dikhata hai, jisse visitors bhaag jaate hain.',
      'SSL certificate lagao (hosting me usually free milta hai — "Let\'s Encrypt" dekho) aur http ko https par redirect karo.');
  } else {
    passed.push('Secure connection (HTTPS) is active.');
  }

  // --- social sharing ---
  if (!ogTitle) {
    addIssue(issues, 'missing-og', 'warning', 'Social sharing preview not set up',
      'When someone shares your page on WhatsApp or Facebook, there is no nice preview title/image set up — it will look plain and get fewer clicks.',
      'Add Open Graph tags in <head>: og:title, og:description, og:image.',
      'Jab koi aapka page WhatsApp/Facebook par share karega, to sundar preview nahi aayega.',
      '<head> me Open Graph tags lagao: og:title, og:description, og:image.');
  }

  // --- speed (fetch time as rough proxy) ---
  if (ms > 1500) {
    addIssue(issues, 'slow-response', 'warning', 'Server responded slowly (' + (ms / 1000).toFixed(1) + 's)',
      'Your server took ' + (ms / 1000).toFixed(1) + ' seconds just to start responding. Slow sites lose visitors and rank lower.',
      'Use a faster host, enable caching, and compress images. Then re-test.',
      'Aapka server jawab dene me ' + (ms / 1000).toFixed(1) + ' second le raha hai. Slow site par visitors bhaag jaate hain.',
      'Fast hosting lo, caching on karo, images compress karo. Phir dobara test karo.');
  } else {
    passed.push('Server responded quickly (' + ms + 'ms).');
  }

  return { issues, passed };
}

function computeScore(issues) {
  let score = 100;
  for (const i of issues) {
    if (i.severity === 'critical') score -= 15;
    else if (i.severity === 'warning') score -= 5;
  }
  return Math.max(5, score);
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/* ---------------- sitemap / robots (best effort) ---------------- */

async function discoverSiteExtras(finalUrl) {
  const origin = new URL(finalUrl).origin;
  const out = { robots: 'unknown', sitemap: 'unknown', sitemapUrls: 0 };
  const robotsTxt = await fetchTextBestEffort(origin + '/robots.txt');
  out.robots = robotsTxt === null ? 'missing' : 'found';
  let sitemapUrl = origin + '/sitemap.xml';
  if (robotsTxt) {
    const m = robotsTxt.match(/^\s*Sitemap:\s*(\S+)/im);
    if (m) sitemapUrl = m[1].trim();
  }
  const sm = await fetchTextBestEffort(sitemapUrl);
  if (sm === null) {
    out.sitemap = 'missing';
  } else {
    out.sitemap = 'found';
    if (/<sitemapindex[\s>]/i.test(sm)) {
      out.sitemapUrls = (sm.match(/<sitemap[\s>]/gi) || []).length;
      out.sitemapKind = 'index';
    } else {
      out.sitemapUrls = (sm.match(/<url[\s>]/gi) || []).length;
      out.sitemapKind = 'urls';
    }
  }
  return out;
}

/* ---------------- PageSpeed (best effort, keyless) ---------------- */

async function getPageSpeed(targetUrl) {
  try {
    const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' +
      encodeURIComponent(targetUrl) + '&strategy=mobile&category=performance';
    const resp = await fetchWithTimeout(api, 25000);
    if (!resp.ok) return null;
    const text = await readCapped(resp.body, 500_000);
    const data = JSON.parse(text);
    const scoreRaw = data?.lighthouseResult?.categories?.performance?.score;
    if (typeof scoreRaw !== 'number') return null;
    return Math.round(scoreRaw * 100);
  } catch {
    return null;
  }
}

/* ---------------- main entry ---------------- */

async function auditUrl(rawInput) {
  const started = Date.now();
  if (!rawInput || !String(rawInput).trim()) {
    return { ok: false, error: 'Please enter a website address.' };
  }
  let input = String(rawInput).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) input = 'https://' + input;

  try {
    const page = await fetchPageGuarded(input);
    const stats = {};
    const { issues, passed } = runChecks(page, stats);

    // site extras (robots/sitemap) + pagespeed — best effort, in parallel, never fail the audit
    let extras = { robots: 'unknown', sitemap: 'unknown', sitemapUrls: 0 };
    let pagespeed = null;
    try {
      const [exRes, psRes] = await Promise.allSettled([
        discoverSiteExtras(page.finalUrl),
        getPageSpeed(page.finalUrl),
      ]);
      if (exRes.status === 'fulfilled') extras = exRes.value;
      if (psRes.status === 'fulfilled') pagespeed = psRes.value;
    } catch {}
    Object.assign(stats, extras);
    if (extras.robots === 'missing') {
      addIssue(issues, 'missing-robots', 'warning', 'No robots.txt found',
        'The robots.txt file (which guides Google on what to crawl) is missing. Most sites should have a simple one.',
        'Add a basic robots.txt at your site root allowing all crawling, plus your sitemap address.',
        'robots.txt file nahi mili. Ye Google ko batati hai kya crawl karna hai.',
        'Site ke root par simple robots.txt banao, sitemap ka address likh ke.');
    } else if (extras.robots === 'found') {
      passed.push('robots.txt found.');
    }
    if (extras.sitemap === 'missing') {
      addIssue(issues, 'missing-sitemap', 'warning', 'No sitemap found',
        'A sitemap is a list of all your pages for Google. Without one, Google may take longer to discover your pages.',
        'Generate a sitemap.xml (most website builders do it automatically) and submit it in Google Search Console.',
        'Sitemap nahi mili. Ye Google ke liye aapke saare pages ki list hoti hai.',
        'sitemap.xml banao (zyadatar website builders auto bana dete hain) aur Google Search Console me submit karo.');
    } else if (extras.sitemap === 'found') {
      passed.push('Sitemap found' + (extras.sitemapUrls ? ' (' + extras.sitemapUrls + (extras.sitemapKind === 'index' ? ' sitemaps' : ' pages') + ' listed)' : '') + '.');
    }

    // pagespeed result (from the parallel best-effort block above)
    if (typeof pagespeed === 'number') {
      stats.pagespeed = pagespeed;
      if (pagespeed < 50) {
        addIssue(issues, 'pagespeed-low', 'warning', 'Mobile speed score is low (' + pagespeed + '/100)',
          'Google measured your mobile speed at ' + pagespeed + '/100. Slow pages lose visitors — most people leave if a page takes over 3 seconds.',
          'Compress images (WebP format), remove heavy animations/plugins, and use a fast host. Re-test after changes.',
          'Aapki mobile speed ' + pagespeed + '/100 hai — bahut slow. 3 second se zyada laga to visitors bhaag jaate hain.',
          'Images compress karo (WebP format), bhaari animations/plugins hatao, fast hosting lo.');
      } else if (pagespeed >= 90) {
        passed.push('Excellent mobile speed score (' + pagespeed + '/100).');
      } else {
        passed.push('Mobile speed score is okay (' + pagespeed + '/100).');
      }
    }

    const score = computeScore(issues);
    const critical = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;

    return {
      ok: true,
      url: input,
      finalUrl: page.finalUrl,
      httpStatus: page.status,
      score,
      grade: gradeFor(score),
      critical,
      warnings,
      passedCount: passed.length,
      ms: Date.now() - started,
      stats,
      issues,   // {id, severity, title, what, fix, what_hi, fix_hi, detail}
      passed,   // strings
      demo: true,
    };
  } catch (e) {
    return { ok: false, error: (e && e.isFriendly && e.message) ? e.message : 'Something went wrong while checking the site. Please try again.' };
  }
}

/* Vercel Serverless Function -> route /api/audit
 * (This file is generated at package time: audit-core.js is inlined above.) */
export default async function handler(req, res) {
  try {
    const target = (req.query && req.query.url) || '';
    const result = await auditUrl(target);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'no-store');
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}
