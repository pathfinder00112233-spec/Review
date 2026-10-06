/* Rankaro demo frontend */
(function () {
  'use strict';

  var form = document.getElementById('auditForm');
  var input = document.getElementById('urlInput');
  var btn = document.getElementById('auditBtn');
  var hero = document.getElementById('hero');
  var loading = document.getElementById('loading');
  var loadingMsg = document.getElementById('loadingMsg');
  var errorBox = document.getElementById('errorBox');
  var errorMsg = document.getElementById('errorMsg');
  var report = document.getElementById('report');

  var lang = 'en'; // 'en' | 'hi'
  var lastData = null;

  var LOADING_MSGS = [
    'Fetching your website…',
    'Reading titles & headings…',
    'Checking images…',
    'Measuring speed…',
    'Writing your report in plain words…'
  ];
  var msgTimer = null;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setLoading(on) {
    if (on) {
      hide(hero); hide(report); hide(errorBox); show(loading);
      btn.disabled = true;
      var i = 0;
      loadingMsg.textContent = LOADING_MSGS[0];
      msgTimer = setInterval(function () {
        i = (i + 1) % LOADING_MSGS.length;
        loadingMsg.textContent = LOADING_MSGS[i];
      }, 1800);
    } else {
      hide(loading);
      btn.disabled = false;
      if (msgTimer) { clearInterval(msgTimer); msgTimer = null; }
    }
  }

  function showError(msg) {
    setLoading(false);
    hide(hero); hide(report);
    errorMsg.textContent = msg;
    show(errorBox);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scoreColor(s) {
    if (s >= 75) return '#059669';
    if (s >= 50) return '#D97706';
    return '#DC2626';
  }

  function renderReport(data) {
    lastData = data;
    setLoading(false);
    hide(hero); hide(errorBox);

    document.getElementById('reportTitle').textContent = 'Report for ' + niceHost(data.finalUrl || data.url);
    document.getElementById('reportUrl').textContent = data.finalUrl || data.url;
    document.getElementById('critCount').textContent = data.critical;
    document.getElementById('warnCount').textContent = data.warnings;
    document.getElementById('passCount').textContent = data.passedCount;

    var C = 351.86;
    var arc = document.getElementById('scoreArc');
    arc.style.strokeDashoffset = C;
    arc.style.stroke = scoreColor(data.score);
    document.getElementById('scoreVal').textContent = data.score;
    document.getElementById('gradeVal').textContent = 'Grade ' + data.grade;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        arc.style.strokeDashoffset = C - (C * data.score / 100);
      });
    });

    renderStats(data.stats);
    renderIssues(data.issues);
    renderPassed(data.passed);
    resetPremium(data.finalUrl || data.url);

    show(report);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function niceHost(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; }
  }

  function renderStats(s) {
    s = s || {};
    var items = [];
    if (typeof s.loadMs === 'number') items.push(['Server response', (s.loadMs / 1000).toFixed(1) + 's']);
    if (typeof s.pagespeed === 'number') items.push(['Mobile speed', s.pagespeed + '/100']);
    if (typeof s.words === 'number') items.push(['Words', s.words.toLocaleString('en-IN')]);
    if (typeof s.images === 'number') items.push(['Images', s.images]);
    if (typeof s.titleLen === 'number') items.push(['Title length', s.titleLen + ' chars']);
    if (s.sitemap === 'found') items.push(['Sitemap', 'Yes' + (s.sitemapUrls ? ' (' + s.sitemapUrls + ')' : '')]);
    else if (s.sitemap === 'missing') items.push(['Sitemap', 'Missing']);
    var grid = document.getElementById('statsGrid');
    grid.innerHTML = items.map(function (it) {
      return '<div class="stat"><div class="k">' + esc(it[0]) + '</div><div class="v">' + esc(it[1]) + '</div></div>';
    }).join('');
  }

  function issueText(issue, field) {
    if (lang === 'hi') return issue[field + '_hi'] || issue[field];
    return issue[field];
  }

  function renderIssues(issues) {
    var box = document.getElementById('issues');
    if (!issues || !issues.length) {
      box.innerHTML = '<p style="color:#059669;font-weight:600">🎉 No problems found. This page is in great shape!</p>';
      return;
    }
    var order = { critical: 0, warning: 1 };
    var sorted = issues.slice().sort(function (a, b) { return order[a.severity] - order[b.severity]; });
    box.innerHTML = sorted.map(function (it) {
      var badge = it.severity === 'critical' ? 'Critical' : 'Warning';
      return '<div class="issue ' + it.severity + '">' +
        '<div class="issue-top"><span class="badge ' + it.severity + '">' + badge + '</span><h4>' + esc(it.title) + '</h4></div>' +
        '<div class="lbl">' + (lang === 'hi' ? 'Iska matlab' : 'What this means') + '</div>' +
        '<p>' + esc(issueText(it, 'what')) + '</p>' +
        '<div class="fix"><div class="lbl" style="margin-top:0">' + (lang === 'hi' ? 'Kaise theek karein' : 'How to fix') + '</div>' +
        '<p>' + esc(issueText(it, 'fix')) + '</p></div>' +
        (it.detail ? '<div class="detail">' + esc(it.detail) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderPassed(passed) {
    var ul = document.getElementById('passedList');
    ul.innerHTML = (passed || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') ||
      '<li>Nothing to show here yet.</li>';
  }

  function runAudit(rawUrl) {
    var url = (rawUrl || '').trim();
    if (!url) { input.focus(); return; }
    setLoading(true);
    fetch('/api/audit?url=' + encodeURIComponent(url))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) renderReport(data);
        else showError((data && data.error) || 'Something went wrong. Please try again.');
      })
      .catch(function () { showError('Could not reach the Rankaro server. Check your connection and try again.'); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    runAudit(input.value);
  });

  document.getElementById('exampleBtn').addEventListener('click', function () {
    input.value = 'mydentalcentre.in';
    runAudit('mydentalcentre.in');
  });

  document.getElementById('retryBtn').addEventListener('click', reset);
  document.getElementById('newAuditBtn').addEventListener('click', reset);

  function reset() {
    hide(report); hide(errorBox); hide(loading);
    show(hero);
    input.value = '';
    input.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // language toggle
  var langEn = document.getElementById('langEn');
  var langHi = document.getElementById('langHi');
  function setLang(l) {
    lang = l;
    langEn.classList.toggle('active', l === 'en');
    langHi.classList.toggle('active', l === 'hi');
    if (lastData) renderIssues(lastData.issues);
  }
  langEn.addEventListener('click', function () { setLang('en'); });
  langHi.addEventListener('click', function () { setLang('hi'); });

  // WhatsApp share
  document.getElementById('waShare').addEventListener('click', function () {
    if (!lastData) return;
    var d = lastData;
    var text = 'I checked my website on Rankaro — it scored ' + d.score + '/100 (Grade ' + d.grade + '): ' +
      d.critical + ' critical issue' + (d.critical === 1 ? '' : 's') + ', ' +
      d.warnings + ' warning' + (d.warnings === 1 ? '' : 's') + '. ' +
      'Check your site free here: ' + window.location.origin + '/';
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  });

  // fix-it modal
  // Rocky: put your WhatsApp number here (country code + number, no + sign),
  // e.g. '919876543210' — then every fix request opens WhatsApp addressed to you.
  var FIX_WHATSAPP_NUMBER = '';
  var modal = document.getElementById('fixModal');
  var fixForm = document.getElementById('fixForm');
  var fixDone = document.getElementById('fixDone');
  document.getElementById('fixBtn').addEventListener('click', function () {
    fixForm.classList.remove('hidden');
    fixDone.classList.add('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });
  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  document.getElementById('modalX').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  function validName(v) { return String(v).trim().length >= 3; }
  function digitsOnly(v) { return String(v).replace(/\D/g, ''); }
  function normalizedPhone(v) {
    var d = digitsOnly(v);
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }
  function validPhone(v) { return /^[6-9]\d{9}$/.test(normalizedPhone(v)); }

  fixForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var nameEl = document.getElementById('fixName');
    var phoneEl = document.getElementById('fixPhone');
    var nameErr = document.getElementById('fixNameErr');
    var phoneErr = document.getElementById('fixPhoneErr');
    var ok = true;

    if (!validName(nameEl.value)) {
      nameErr.textContent = 'Please enter your full name (at least 3 letters).';
      nameErr.classList.add('show'); nameEl.classList.add('bad'); ok = false;
    } else {
      nameErr.classList.remove('show'); nameEl.classList.remove('bad');
    }
    if (!validPhone(phoneEl.value)) {
      phoneErr.textContent = 'Please enter a valid 10-digit mobile number.';
      phoneErr.classList.add('show'); phoneEl.classList.add('bad'); ok = false;
    } else {
      phoneErr.classList.remove('show'); phoneEl.classList.remove('bad');
    }
    if (!ok) return;

    var name = nameEl.value.trim();
    var phone = normalizedPhone(phoneEl.value);
    var note = document.getElementById('fixNote').value.trim();
    var site = lastData ? (lastData.finalUrl || lastData.url || '') : '';

    if (FIX_WHATSAPP_NUMBER) {
      var msg = 'New Rankaro fix request\nName: ' + name + '\nPhone: ' + phone +
        (site ? '\nSite: ' + site : '') +
        (note ? '\nNote: ' + note : '');
      window.open('https://wa.me/' + FIX_WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg), '_blank');
      var doneP = fixDone.querySelector('p');
      if (doneP) doneP.innerHTML = 'Opening WhatsApp with your request — just press send.<br><span class="tiny">Your details go straight to the Rankaro team.</span>';
    }
    fixForm.classList.add('hidden');
    fixDone.classList.remove('hidden');
  });
  // clear errors while typing
  document.getElementById('fixName').addEventListener('input', function () {
    document.getElementById('fixNameErr').classList.remove('show');
    this.classList.remove('bad');
  });
  document.getElementById('fixPhone').addEventListener('input', function () {
    document.getElementById('fixPhoneErr').classList.remove('show');
    this.classList.remove('bad');
  });

  /* ---------- premium unlock (Razorpay + DataForSEO) ---------- */
  var UNLOCK_PRICE = 299;
  var unlockCfg = { paymentsOn: false, keyId: null };
  var LS_KEY = 'rankaro_unlock_v1';

  function normKey(u) {
    try { var x = new URL(u); return (x.origin + x.pathname.replace(/\/$/, '')).toLowerCase(); }
    catch (e) { return String(u).toLowerCase(); }
  }
  function readStore() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeStore(o) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {}
  }
  function savedUnlock(url) {
    var e = readStore()[normKey(url)];
    return (e && e.exp > Date.now() && e.data) ? e : null;
  }

  function setUnlockStatus(t) {
    document.getElementById('unlockStatus').textContent = t || '';
  }

  function paintUnlockZone() {
    var btn = document.getElementById('unlockBtn');
    if (!unlockCfg.paymentsOn) {
      btn.textContent = lang === 'hi' ? 'Unlock — jald aa raha hai' : 'Unlock full report — coming soon';
      btn.disabled = true;
    } else {
      btn.textContent = (lang === 'hi' ? 'Full report unlock karo — ₹' : 'Unlock full report — ₹') + UNLOCK_PRICE;
      btn.disabled = false;
    }
  }

  async function loadUnlockConfig() {
    try {
      var r = await fetch('/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'config' }) });
      var j = await r.json();
      if (j && j.ok) {
        unlockCfg.paymentsOn = !!j.paymentsOn;
        unlockCfg.keyId = j.keyId || null;
        if (j.price) UNLOCK_PRICE = j.price;
      }
    } catch (e) {}
    paintUnlockZone();
  }

  function deriveSeed() {
    var t = (lastData && lastData.stats && lastData.stats.title) || '';
    var s = t.split(/[|–—:·\-]/)[0].trim().slice(0, 60);
    return s || niceHost(lastData ? (lastData.finalUrl || lastData.url || '') : '');
  }

  async function startUnlock() {
    var url = lastData ? (lastData.finalUrl || lastData.url) : (input.value || '').trim();
    if (!url) return;
    if (!unlockCfg.paymentsOn || !unlockCfg.keyId) {
      setUnlockStatus(lang === 'hi' ? 'Payment abhi connected nahi hai — jald aa raha hai.' : 'Payments are not connected yet — coming soon.');
      return;
    }
    if (typeof Razorpay === 'undefined') {
      setUnlockStatus('Could not load the payment window. Check your connection and try again.');
      return;
    }
    setUnlockStatus(lang === 'hi' ? 'Secure payment shuru ho raha hai…' : 'Starting secure payment…');
    var o = null;
    try {
      var r = await fetch('/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'order', url: url }) });
      o = await r.json();
    } catch (e) {}
    if (!o || !o.ok) { setUnlockStatus((o && o.error) || 'Could not start payment. Try again.'); return; }

    var rz = new Razorpay({
      key: unlockCfg.keyId,
      amount: o.amount,
      currency: 'INR',
      name: 'Rankaro',
      description: 'Full SEO report — ' + niceHost(url),
      order_id: o.orderId,
      theme: { color: '#4F46E5' },
      modal: { ondismiss: function () { setUnlockStatus(''); } },
      handler: function (resp) { completeUnlock(resp, url); }
    });
    rz.on('payment.failed', function () {
      setUnlockStatus(lang === 'hi' ? 'Payment fail ho gaya. Paise nahi kate. Dobara try karo.' : 'Payment failed. No money was taken. Try again.');
    });
    rz.open();
  }

  async function completeUnlock(resp, url) {
    setUnlockStatus(lang === 'hi' ? 'Payment verify ho raha hai…' : 'Verifying payment…');
    var v = null;
    try {
      var r = await fetch('/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'verify', orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature, url: url }) });
      v = await r.json();
    } catch (e) {}
    if (!v || !v.ok) { setUnlockStatus((v && v.error) || 'Verification failed. If money was taken, contact us.'); return; }
    setUnlockStatus(lang === 'hi' ? 'Payment verified! Premium data aa raha hai… (lagbhag 30 second)' : 'Payment verified! Fetching your premium data… (takes ~30 seconds)');
    var d = null;
    try {
      var r2 = await fetch('/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'data', pass: v.pass, url: url, seed: deriveSeed() }) });
      d = await r2.json();
    } catch (e) {}
    // save the pass either way — retrying the data fetch won't charge again
    var st = readStore();
    st[normKey(url)] = { pass: v.pass, exp: v.exp, data: (d && d.ok) ? d.data : null, ts: Date.now() };
    writeStore(st);
    if (!d || !d.ok) { setUnlockStatus((d && d.error) || 'Could not fetch premium data just now. Tap unlock again to retry — you will not be charged again.'); return; }
    setUnlockStatus('');
    renderUnlocked(d.data, true);
  }

  function fmtNum(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-IN');
  }

  function renderUnlocked(data, scroll) {
    hide(document.getElementById('lockedGrid'));
    hide(document.getElementById('unlockZone'));
    var box = document.getElementById('premiumSections');
    box.classList.remove('hidden');
    var hi = (lang === 'hi');

    var kwHtml;
    if (data.keywords && data.keywords.ok && data.keywords.items.length) {
      var rows = data.keywords.items.map(function (k) {
        return '<tr><td>' + esc(k.kw) + '</td><td>' + fmtNum(k.vol) + '</td><td>' + esc(k.comp || '—') + '</td></tr>';
      }).join('');
      kwHtml = '<table class="data-table"><tr><th>Keyword</th><th>Searches/mo</th><th>Competition</th></tr>' + rows + '</table>' +
        '<p class="sec-note">' + esc(hi ? 'Ye woh shabd hain jo log Google par search karte hain. Zyada searches + kam competition = aapke liye best mauka.' : 'These are words people actually search on Google. High searches + low competition = your best opportunity.') + '</p>';
    } else {
      kwHtml = '<p class="sec-note">' + esc(hi ? 'Is site ke liye keyword data nahi mil paya.' : 'Keyword data was not available for this site.') + '</p>';
    }
    document.getElementById('kwSection').innerHTML =
      '<div class="premium-sec"><h4>🔑 ' + esc(hi ? 'Keywords jo log search karte hain' : 'Keywords people search') + '</h4>' + kwHtml + '</div>';

    var compHtml;
    if (data.competitors && data.competitors.ok && data.competitors.items.length) {
      compHtml = '<ol class="comp-list">' + data.competitors.items.map(function (c) {
        return '<li><b>#' + (c.pos || '?') + '</b> ' + esc(c.title || c.domain) + '<br><span class="tiny">' + esc(c.domain) + '</span></li>';
      }).join('') + '</ol>' +
        '<p class="sec-note">' + esc(hi ? 'Ye sites "' + data.seed + '" ke liye Google me aapse upar hain. Inhe harane ke liye: behtar content, zyada backlinks, tez page.' : 'These sites rank above you for "' + data.seed + '". To beat them you typically need: deeper content, more backlinks, a faster page.') + '</p>';
    } else {
      compHtml = '<p class="sec-note">' + esc('Competitor data was not available for this keyword.') + '</p>';
    }
    var blHtml = '';
    if (data.backlinks && data.backlinks.ok) {
      blHtml = '<div class="bl-stats"><div><b>' + fmtNum(data.backlinks.referringDomains) + '</b><span>' + esc(hi ? 'websites aapko link karti hain' : 'websites link to you') + '</span></div>' +
        '<div><b>' + fmtNum(data.backlinks.backlinks) + '</b><span>' + esc(hi ? 'total backlinks' : 'total backlinks') + '</span></div></div>' +
        '<p class="sec-note">' + esc(hi ? "Backlinks Google ke liye recommendations hain. Zyada quality links = upar ranking." : 'Backlinks are recommendations in Google\'s eyes. More quality links = higher rankings.') + '</p>';
    }
    document.getElementById('compSection').innerHTML =
      '<div class="premium-sec"><h4>⚔️ ' + esc(hi ? 'Aapke competitors' : 'Your competitors') + '</h4>' + compHtml + blHtml + '</div>';

    var aiHtml;
    if (data.ai && data.ai.ok) {
      aiHtml = data.ai.mentions > 0
        ? '<p class="sec-note">' + esc(hi ? 'AI answers me aapka brand ' + data.ai.mentions + ' baar mention hua — achhi shuruaat!' : 'Your brand was mentioned ' + data.ai.mentions + ' time(s) in AI answers — a good start! Keep building mentions.') + '</p>'
        : '<p class="sec-note">' + esc(hi ? 'AI answers me aapka brand abhi mention nahi hota. Guest posts, directories aur PR se AI tools aapka naam seekhenge.' : 'Your brand is not mentioned in AI answers yet. Guest posts, business directories, and PR teach AI tools your name.') + '</p>';
    } else {
      aiHtml = '<p class="sec-note">' + esc('AI visibility data was not available right now.') + '</p>';
    }
    document.getElementById('aiSection').innerHTML =
      '<div class="premium-sec"><h4>🤖 ' + esc(hi ? 'AI me aapki visibility' : 'Your AI visibility') + '</h4>' + aiHtml + '</div>';

    if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetPremium(url) {
    var box = document.getElementById('premiumSections');
    box.classList.add('hidden');
    box.innerHTML = '<div id="kwSection"></div><div id="compSection"></div><div id="aiSection"></div>';
    var lg = document.getElementById('lockedGrid');
    if (lg) lg.classList.remove('hidden');
    var uz = document.getElementById('unlockZone');
    if (uz) uz.classList.remove('hidden');
    setUnlockStatus('');
    paintUnlockZone();
    var s = savedUnlock(url);
    if (s) renderUnlocked(s.data, false);
  }

  document.getElementById('unlockBtn').addEventListener('click', startUnlock);
  loadUnlockConfig();
})();
