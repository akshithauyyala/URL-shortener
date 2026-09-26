(() => {
  'use strict';
  const STORAGE_KEY = 'shortly.links.v1';
  const THEME_KEY = 'shortly.theme';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const form = $('#shorten-form');
  const urlInput = $('#long-url');
  const aliasInput = $('#alias');
  const errorNode = $('#form-error');
  const resultCard = $('#result-card');
  const linksBody = $('#links-body');
  let links = [];
  let pendingDelete = null;
  let activeDialogTrigger = null;
  let analyticsWindow = 7;
  let toastTimer;

  function readLinks() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (!value) return [];
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('Invalid saved data');
      return parsed.filter(item => item && typeof item.code === 'string' && typeof item.originalUrl === 'string' && safeHttpUrl(item.originalUrl))
        .map(item => ({ code: item.code, originalUrl: safeHttpUrl(item.originalUrl).href, alias: item.alias || '', clicks: Number.isFinite(item.clicks) ? item.clicks : 0, createdAt: item.createdAt || new Date().toISOString(), active: item.active !== false, clickTimestamps: Array.isArray(item.clickTimestamps) ? item.clickTimestamps.filter(Number.isFinite) : [] }));
    } catch {
      showToast('Saved links could not be read. Check browser storage settings.', 'error');
      return [];
    }
  }
  function saveLinks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(links)); return true; }
    catch { showToast('Your browser could not save this change. Check available storage.', 'error'); return false; }
  }
  function safeHttpUrl(value) {
    try { const parsed = new URL(value.trim()); return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null; }
    catch { return null; }
  }
  function safeAlias(value) { return /^[a-zA-Z0-9_-]{1,48}$/.test(value); }
  function makeCode() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code;
    do { const bytes = new Uint8Array(7); crypto.getRandomValues(bytes); code = [...bytes].map(byte => alphabet[byte % alphabet.length]).join(''); }
    while (links.some(link => link.code.toLowerCase() === code.toLowerCase()));
    return code;
  }
  function shortUrl(code) { const target = new URL(location.href); target.hash = `/${code}`; return target.href; }
  function displayUrl(code) { return location.protocol === 'file:' ? `${location.pathname.split('/').pop()}#/${code}` : `${location.host}${location.pathname}#/${code}`; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
  function showToast(message, kind = '') {
    const toast = document.createElement('div'); toast.className = `toast ${kind}`; toast.setAttribute('role', kind === 'error' ? 'alert' : 'status'); toast.textContent = message;
    $('#toast-region').append(toast); window.setTimeout(() => toast.remove(), 3100);
  }
  async function copyText(value, button) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else { const temporary = document.createElement('textarea'); temporary.value = value; temporary.style.position = 'fixed'; temporary.style.opacity = '0'; document.body.append(temporary); temporary.select(); const copied = document.execCommand('copy'); temporary.remove(); if (!copied) throw new Error('Copy unavailable'); }
      if (button) { const oldText = button.textContent; button.textContent = 'Copied ✓'; button.disabled = true; setTimeout(() => { button.textContent = oldText; button.disabled = false; }, 1500); }
      showToast('Link copied to clipboard.');
    } catch { showToast('Could not copy the link. You can select and copy it instead.', 'error'); }
  }
  function formatDate(date) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date)); }
  function dayStart(time = Date.now()) { const d = new Date(time); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function todayClicks(link) { return link.clickTimestamps.filter(time => time >= dayStart()).length; }
  function renderStats() {
    $('#stat-links').textContent = links.length.toLocaleString();
    $('#stat-clicks').textContent = links.reduce((sum, item) => sum + item.clicks, 0).toLocaleString();
    $('#stat-active').textContent = links.filter(item => item.active).length.toLocaleString();
    $('#stat-today').textContent = links.reduce((sum, item) => sum + todayClicks(item), 0).toLocaleString();
  }
  function renderLinks() {
    const query = $('#link-search').value.trim().toLowerCase();
    const filter = $('#link-filter').value;
    let visible = links.filter(item => !query || `${item.code} ${item.alias} ${item.originalUrl}`.toLowerCase().includes(query));
    if (filter === 'active') visible = visible.filter(item => item.active);
    if (filter === 'recent') visible = [...visible].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (filter === 'popular') visible = [...visible].sort((a,b) => b.clicks - a.clicks);
    $('#link-count').textContent = links.length;
    $('#links-empty').hidden = links.length > 0;
    $('#no-results').hidden = links.length === 0 || visible.length > 0;
    $('.table-wrap').hidden = visible.length === 0;
    linksBody.innerHTML = visible.map(item => {
      const href = shortUrl(item.code);
      return `<tr data-code="${escapeHtml(item.code)}"><td><div class="short-link-cell"><a href="${escapeHtml(href)}" data-short-link>${escapeHtml(displayUrl(item.code))}</a><button class="copy-mini" data-action="copy" aria-label="Copy ${escapeHtml(displayUrl(item.code))}" title="Copy link">⧉</button></div></td><td class="original-cell" title="${escapeHtml(item.originalUrl)}">${escapeHtml(item.originalUrl)}</td><td class="clicks-cell">${item.clicks.toLocaleString()}</td><td class="date-cell">${escapeHtml(formatDate(item.createdAt))}</td><td class="status-cell"><span class="status-pill">${item.active ? 'Active' : 'Paused'}</span></td><td><div class="row-actions"><button data-action="open">Open</button><button data-action="analytics">Analytics</button><button data-action="delete" class="delete-link">Delete</button></div></td></tr>`;
    }).join('');
    renderStats();
  }
  function createLink(event) {
    event.preventDefault(); errorNode.textContent = ''; urlInput.removeAttribute('aria-invalid'); aliasInput.removeAttribute('aria-invalid');
    const rawUrl = urlInput.value.trim(); const alias = aliasInput.value.trim(); const parsed = safeHttpUrl(rawUrl);
    if (!rawUrl) return validationError('Enter a URL to shorten.', urlInput);
    if (!parsed) return validationError('Enter a valid URL that starts with http:// or https://.', urlInput);
    if (alias && !safeAlias(alias)) return validationError('Use up to 48 letters, numbers, hyphens, or underscores for your alias.', aliasInput);
    if (alias && links.some(item => item.code.toLowerCase() === alias.toLowerCase())) return validationError('This alias is already in use.', aliasInput);
    const record = { originalUrl: parsed.href, code: alias || makeCode(), alias, clicks: 0, createdAt: new Date().toISOString(), active: true, clickTimestamps: [] };
    links.unshift(record);
    if (!saveLinks()) { links.shift(); return; }
    const generated = shortUrl(record.code); $('#result-link').href = generated; $('#result-link').textContent = displayUrl(record.code); $('#result-original').textContent = record.originalUrl; resultCard.hidden = false;
    urlInput.value = ''; aliasInput.value = ''; renderLinks(); showToast('Your short link is ready.');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function validationError(message, input) { errorNode.textContent = message; input.setAttribute('aria-invalid', 'true'); input.focus(); }
  function renderRoute() {
    const match = location.hash.match(/^#\/(.+)$/);
    if (!match) { $('#route-screen').hidden = true; document.body.classList.remove('route-active'); return; }
    const code = match[1].split('?')[0];
    const screen = $('#route-screen'); screen.hidden = false; document.body.classList.add('route-active');
    const item = links.find(link => link.code.toLowerCase() === code.toLowerCase());
    if (!item) { screen.innerHTML = `<div class="route-content"><a class="brand route-brand" href="#home"><span class="brand-mark">s</span> shortly<span class="brand-period">.</span></a><span class="route-code">LINK NOT FOUND</span><h1>Well, that’s a<br>dead end.</h1><p>This short link doesn’t exist here. It may have been deleted or created in a different browser.</p><a class="button button-primary" href="#home">Back to home <span>→</span></a></div>`; return; }
    if (!item.active) { screen.innerHTML = `<div class="route-content"><a class="brand route-brand" href="#home"><span class="brand-mark">s</span> shortly<span class="brand-period">.</span></a><span class="route-code">LINK PAUSED</span><h1>This link<br>is paused.</h1><p>The owner has paused this short link.</p><a class="button button-primary" href="#home">Back to home <span>→</span></a></div>`; return; }
    item.clicks += 1; item.clickTimestamps.push(Date.now()); saveLinks(); renderLinks();
    screen.innerHTML = `<div class="route-content"><a class="brand route-brand" href="#home"><span class="brand-mark">s</span> shortly<span class="brand-period">.</span></a><span class="route-code">LINK READY</span><h1>Taking you<br>there now.</h1><p>Opening <strong>${escapeHtml(new URL(item.originalUrl).hostname)}</strong>…</p><a class="button button-light" href="#home">Back to home</a></div>`;
    window.setTimeout(() => { location.replace(item.originalUrl); }, 500);
  }
  function openDeleteDialog(code, trigger) {
    pendingDelete = code; activeDialogTrigger = trigger; $('#delete-modal').hidden = false; $('[data-cancel-delete]').focus();
  }
  function closeDeleteDialog() { $('#delete-modal').hidden = true; pendingDelete = null; if (activeDialogTrigger?.isConnected) activeDialogTrigger.focus(); }
  function deleteLink() {
    const previous = links; const oldLength = links.length; links = links.filter(item => item.code !== pendingDelete);
    if (links.length === oldLength) { closeDeleteDialog(); showToast('This link could not be found.', 'error'); return; }
    if (saveLinks()) { renderLinks(); showToast('Link deleted.'); } else links = previous;
    closeDeleteDialog();
  }
  function openAnalytics(item) {
    analyticsWindow = 7;
    const screen = $('#route-screen'); screen.hidden = false; document.body.classList.add('route-active');
    const weekStart = dayStart() - ((new Date().getDay() + 6) % 7) * 864e5;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    screen.innerHTML = `<div class="analytics-page"><header class="analytics-page-head"><a class="brand" href="#home"><span class="brand-mark">s</span> shortly<span class="brand-period">.</span></a><button class="button button-light" data-action="analytics-back">← Dashboard</button></header><div class="analytics-title"><div><div class="eyebrow">LINK ANALYTICS</div><h1>Link performance</h1><a class="analytics-destination" href="${escapeHtml(item.originalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.originalUrl)} ↗</a></div><div class="analytics-short">SHORT LINK<strong>${escapeHtml(displayUrl(item.code))}</strong></div></div><div class="analytics-metrics"><article><span>Total clicks</span><strong>${item.clicks.toLocaleString()}</strong></article><article><span>Clicks today</span><strong>${countSince(item, dayStart())}</strong></article><article><span>Clicks this week</span><strong>${countSince(item, weekStart)}</strong></article><article><span>Clicks this month</span><strong>${countSince(item, monthStart)}</strong></article></div><section class="analytics-chart-card"><div class="analytics-chart-head"><div><h2>Clicks over time</h2><p>Based on visits recorded in this browser.</p></div><div class="range-buttons"><button class="selected" data-range="7">7 days</button><button data-range="30">30 days</button><button data-range="90">90 days</button></div></div><div class="analytics-chart" id="analytics-chart"></div></section></div>`;
    drawAnalyticsChart(item, analyticsWindow);
  }
  function countSince(item, start) { return item.clickTimestamps.filter(time => time >= start).length; }
  function drawAnalyticsChart(item, days) {
    const chart = $('#analytics-chart'); if (!chart) return;
    const counts = Array.from({length: days}, (_, index) => { const start = dayStart(Date.now() - (days - 1 - index)*864e5); return item.clickTimestamps.filter(time => time >= start && time < start + 864e5).length; });
    const max = Math.max(1, ...counts); const width = 700, height = 210, points = counts.map((value, index) => `${days === 1 ? width/2 : index*width/(days-1)},${height - 15 - (value/max)*(height-35)}`).join(' ');
    const labels = days <= 7 ? counts.map((_,i) => new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(Date.now()-(days-1-i)*864e5)) : [0,Math.floor((days-1)/2),days-1].map(i => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(Date.now()-(days-1-i)*864e5));
    chart.innerHTML = `<div class="analytics-y"><span>${max}</span><span>${Math.ceil(max*.66)}</span><span>${Math.ceil(max*.33)}</span><span>0</span></div><div class="analytics-plot"><div class="analytics-guides"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${counts.reduce((a,b)=>a+b,0)} clicks over the last ${days} days"><polyline points="${points}"/></svg><div class="analytics-labels">${labels.map(label=>`<span>${escapeHtml(label)}</span>`).join('')}</div></div>`;
  }
  function applyTheme(theme) { document.body.classList.toggle('theme-dark', theme === 'dark'); try { localStorage.setItem(THEME_KEY, theme); } catch { /* The selected theme still applies for this page view. */ } $$('[data-theme-toggle]').forEach(button => { button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); button.title = button.getAttribute('aria-label'); }); }

  try { links = readLinks(); const theme = localStorage.getItem(THEME_KEY); applyTheme(theme === 'dark' ? 'dark' : 'light'); } catch { links = []; }
  $('#year').textContent = new Date().getFullYear();
  renderLinks();
  form.addEventListener('submit', createLink);
  [urlInput, aliasInput].forEach(input => input.addEventListener('input', () => { errorNode.textContent = ''; input.removeAttribute('aria-invalid'); }));
  $('#dismiss-result').addEventListener('click', () => { resultCard.hidden = true; });
  $('[data-copy-result]').addEventListener('click', event => copyText($('#result-link').href, event.currentTarget));
  $('[data-open-result]').addEventListener('click', () => { location.hash = $('#result-link').hash; });
  $('#link-search').addEventListener('input', renderLinks); $('#link-filter').addEventListener('change', renderLinks);
  $$('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark')));
  $('#menu-toggle').addEventListener('click', event => { const button = event.currentTarget; const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); $('#main-nav').classList.toggle('open', open); });
  $$('#main-nav a').forEach(link => link.addEventListener('click', () => { $('#main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false'); }));
  $$('[data-focus-shortener]').forEach(button => button.addEventListener('click', () => { urlInput.focus(); window.scrollTo({top: $('#shorten-form').getBoundingClientRect().top + scrollY - 95, behavior:'smooth'}); }));
  linksBody.addEventListener('click', event => {
    const action = event.target.closest('[data-action]'); if (!action) return;
    const row = action.closest('tr'); const item = links.find(link => link.code === row?.dataset.code); if (!item) { showToast('This link could not be found.', 'error'); return; }
    switch (action.dataset.action) {
      case 'copy': copyText(shortUrl(item.code), action); break;
      case 'open': location.hash = `#/${encodeURIComponent(item.code)}`; break;
      case 'analytics': openAnalytics(item); break;
      case 'delete': openDeleteDialog(item.code, action); break;
    }
  });
  $('#confirm-delete').addEventListener('click', deleteLink);
  $$('[data-cancel-delete]').forEach(button => button.addEventListener('click', closeDeleteDialog));
  $('#delete-modal').addEventListener('click', event => { if (event.target.id === 'delete-modal') closeDeleteDialog(); });
  document.addEventListener('keydown', event => {
    if ($('#delete-modal').hidden) return;
    if (event.key === 'Escape') { closeDeleteDialog(); return; }
    if (event.key === 'Tab') {
      const controls = $$('.modal button').filter(button => !button.disabled);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('#route-screen').addEventListener('click', event => {
    const back = event.target.closest('[data-action="analytics-back"]'); if (back) { $('#route-screen').hidden = true; document.body.classList.remove('route-active'); return; }
    const range = event.target.closest('[data-range]'); if (range) { analyticsWindow = Number(range.dataset.range); $$('.range-buttons button').forEach(button => button.classList.toggle('selected', button === range)); const code = $('.analytics-short strong')?.textContent.split('#/').pop(); const item = links.find(link => link.code === code); if (item) drawAnalyticsChart(item, analyticsWindow); }
  });
  window.addEventListener('hashchange', renderRoute);
  if (location.hash.startsWith('#/')) renderRoute();
})();
