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

  // fix-it modal
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
  fixForm.addEventListener('submit', function (e) {
    e.preventDefault();
    fixForm.classList.add('hidden');
    fixDone.classList.remove('hidden');
  });
})();
