/* ==========================================================================
   PS2EATER control room
   Plain JavaScript, no build step. Runs from GitHub Pages or a local server.
   ========================================================================== */
(function () {
  'use strict';

  var API = 'https://api.github.com';
  var CFG_KEY = 'ps2eater.cms.cfg.v1';
  var DATA_PATH = 'data.json';

  var DEFAULT_CATS = [
    { id: 'tools', nav: 'Tools', title: 'Modding Tools', blurb: 'Editors, converters and utilities for SVR 2006-2011.', order: 1 },
    { id: 'characters', nav: 'Characters', title: 'Custom Characters', blurb: 'Hand-built superstars, ready to drop into your roster.', order: 2 },
    { id: 'movepacks', nav: 'Move Packs', title: 'Move Packs', blurb: 'Move sets ported and tuned between SVR titles.', order: 3 }
  ];

  var EMOJIS = ('\uD83C\uDFAE \uD83C\uDFAD \uD83D\uDC4A \uD83D\uDCAA \uD83C\uDFC6 \u2B50 \uD83D\uDD25 \uD83D\uDCA5 \u26A1 \uD83D\uDC80 \uD83D\uDC51 \uD83D\uDC0D \uD83E\uDD87 ' +
    '\uD83C\uDFAC \uD83D\uDCBE \uD83D\uDD27 \uD83C\uDFA8 \uD83D\uDD04 \uD83D\uDCE6 \uD83C\uDFAF \uD83E\uDDE9 \uD83D\uDDE1\uFE0F \uD83D\uDEE0\uFE0F \uD83E\uDDEA \uD83D\uDCBF \uD83D\uDCDD ' +
    '\uD83C\uDFB5 \uD83D\uDDBC\uFE0F \uD83D\uDD79\uFE0F \uD83C\uDF9B\uFE0F \uD83E\uDDF0 \uD83D\uDD2C \uD83D\uDCE1 \uD83E\uDD4A \uD83C\uDFC5 \uD83E\uDDF1 \u2728 \uD83D\uDE80 ' +
    '\uD83C\uDFC1 \uD83E\uDD47 \uD83D\uDC7E \uD83C\uDFF9 \uD83C\uDF9F\uFE0F \uD83D\uDCF1 \uD83D\uDD0C \uD83D\uDCC0 \uD83D\uDD17').split(' ');

  /* ---------------------------------------------------------------- utils */

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(text) {
    return String(text || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function shortSha(sha) { return String(sha || '').slice(0, 7); }
  function isPaid(item) {
    var price = String((item && item.price) || '').trim().toLowerCase();
    return price !== '' && price !== 'free' && price !== '$0' && price !== '0';
  }
  function priceOf(item) { return isPaid(item) ? String(item.price).trim() : 'Free'; }
  function formatDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function timeAgo(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    var diff = Math.round((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + ' min ago';
    if (diff < 86400) return Math.round(diff / 3600) + ' h ago';
    if (diff < 2592000) return Math.round(diff / 86400) + ' d ago';
    return formatDate(value);
  }
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function b64decode(encoded) {
    var binary = atob(String(encoded || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------------------------------------------------------------- state */

  var S = {
    cfg: { owner: 'ps2eater', repo: 'ps2eater.github.io', branch: 'main', token: '', remember: true },
    mode: 'offline',                 // github | offline
    connected: false,
    data: null,
    base: null,
    sha: null,
    view: 'overview',
    cat: 'tools',
    q: '',
    filter: 'all',
    sort: 'manual',
    selection: [],
    draft: null,
    draftCat: 'tools',
    draftIndex: -1,
    commits: null,
    rate: null,
    checks: [],
    busy: false,
    lastSync: null,
    openMenu: null
  };

  /* ------------------------------------------------------------- config */

  function loadCfg() {
    var raw = null;
    try { raw = localStorage.getItem(CFG_KEY) || sessionStorage.getItem(CFG_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        S.cfg = Object.assign(S.cfg, parsed);
      } catch (e) { /* ignore corrupt config */ }
    }
  }

  function saveCfg() {
    var payload = JSON.stringify(S.cfg);
    try {
      localStorage.removeItem(CFG_KEY);
      sessionStorage.removeItem(CFG_KEY);
      (S.cfg.remember ? localStorage : sessionStorage).setItem(CFG_KEY, payload);
    } catch (e) { /* storage can be blocked in private mode */ }
  }

  function forgetCfg() {
    try {
      localStorage.removeItem(CFG_KEY);
      sessionStorage.removeItem(CFG_KEY);
    } catch (e) { /* ignore */ }
  }

  /* ----------------------------------------------------------- github api */

  function repoPath() {
    return '/repos/' + encodeURIComponent(S.cfg.owner) + '/' + encodeURIComponent(S.cfg.repo);
  }

  function contentsPath(path) {
    return repoPath() + '/contents/' + String(path).split('/').map(encodeURIComponent).join('/');
  }

  async function ghRequest(path, opts) {
    opts = opts || {};
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (S.cfg.token) headers.Authorization = 'Bearer ' + S.cfg.token;
    if (opts.body) headers['Content-Type'] = 'application/json';

    var started = performance.now();
    var res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
        credentials: 'omit'
      });
    } catch (networkError) {
      var err = new Error('Could not reach api.github.com. Check the internet connection, VPN or firewall, then retry.');
      err.offline = true;
      err.cause = networkError;
      throw err;
    }

    var text = await res.text();
    var json = null;
    if (text) {
      try { json = JSON.parse(text); } catch (e) { json = { message: text.slice(0, 240) }; }
    }
    var ms = Math.round(performance.now() - started);
    var reset = res.headers.get('x-ratelimit-reset');
    if (res.headers.get('x-ratelimit-remaining')) {
      S.rate = {
        remaining: Number(res.headers.get('x-ratelimit-remaining')),
        limit: Number(res.headers.get('x-ratelimit-limit')),
        reset: reset ? new Date(Number(reset) * 1000) : null
      };
    }
    return { ok: res.ok, status: res.status, json: json, ms: ms };
  }

  function friendlyError(result) {
    var message = (result.json && result.json.message) || ('HTTP ' + result.status);
    if (result.status === 401) return 'Token rejected (401). It may be expired or revoked, or it does not belong to the right account.';
    if (result.status === 403 && /rate limit/i.test(message)) return 'GitHub rate limit reached. Wait until the reset time on the Connection page.';
    if (result.status === 403) return 'Access denied (403). The token needs Contents: Read and write on this repository.';
    if (result.status === 404) return 'Not found (404). Check the owner, repository name, branch and token scope.';
    if (result.status === 409) return 'Conflict (409). data.json changed on GitHub since you loaded it. Reload, then publish again.';
    if (result.status === 422) return 'GitHub rejected the request (422): ' + message;
    return message + ' (' + result.status + ')';
  }

  async function gh(path, opts) {
    var result = await ghRequest(path, opts);
    if (result.ok) return result.json;
    var err = new Error(friendlyError(result));
    err.status = result.status;
    err.payload = result.json;
    throw err;
  }

  async function readRepoFile(path, ref) {
    var json = await gh(contentsPath(path) + '?ref=' + encodeURIComponent(ref || S.cfg.branch) + '&t=' + Date.now());
    if (!json || typeof json.content !== 'string') throw new Error('GitHub returned an unexpected response for ' + path + '.');
    return { text: b64decode(json.content), sha: json.sha, size: json.size };
  }

  async function writeRepoFile(path, text, message, sha) {
    var body = { message: message, content: b64encode(text), branch: S.cfg.branch };
    if (sha) body.sha = sha;
    return gh(contentsPath(path), { method: 'PUT', body: body });
  }

  async function fileExists(path) {
    try {
      var json = await gh(contentsPath(path) + '?ref=' + encodeURIComponent(S.cfg.branch) + '&t=' + Date.now());
      return json && json.sha ? json.sha : null;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  /* --------------------------------------------------------------- model */

  function normalize(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    data.site = Object.assign({
      title: 'PS2EATER',
      tagline: '',
      subtitle: '',
      about: '',
      announcement: '',
      announcementEnabled: false,
      footer: '',
      social: { discord: '', github: '', itch: '' }
    }, data.site || {});
    data.site.social = Object.assign({
      discord: '', patreon: '', facebook: '', telegram: '', tiktok: '', x: '', github: '', itch: ''
    }, data.site.social || {});

    if (!Array.isArray(data.categories) || !data.categories.length) {
      data.categories = clone(DEFAULT_CATS);
    }
    data.categories = data.categories.filter(function (c) { return c && c.id; });
    data.categories.sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
    data.categories.forEach(function (cat, i) {
      if (!cat.nav) cat.nav = cat.title || cat.id;
      if (!cat.title) cat.title = cat.nav;
      if (cat.order === undefined || cat.order === null) cat.order = i + 1;
      if (!Array.isArray(data[cat.id])) data[cat.id] = [];
      data[cat.id] = data[cat.id].filter(function (item) { return item && typeof item === 'object'; });
      data[cat.id].forEach(function (item) {
        if (!item.id) item.id = slug(item.name) || 'item-' + Math.random().toString(36).slice(2, 7);
        if (item.features && !Array.isArray(item.features)) item.features = String(item.features).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (item.tags && !Array.isArray(item.tags)) item.tags = String(item.tags).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      });
    });
    return data;
  }

  function cats() { return S.data ? S.data.categories : clone(DEFAULT_CATS); }
  function catById(id) { return cats().filter(function (c) { return c.id === id; })[0] || null; }
  function items(catId) { return (S.data && Array.isArray(S.data[catId])) ? S.data[catId] : []; }
  function isCatView(id) { return cats().some(function (c) { return c.id === id; }); }
  function firstCatId() {
    var list = cats();
    return list.length ? list[0].id : 'tools';
  }
  var CAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>';
  function allItems() {
    var out = [];
    cats().forEach(function (cat) {
      items(cat.id).forEach(function (item) { out.push({ item: item, cat: cat }); });
    });
    return out;
  }
  function isDirty() {
    if (!S.data || !S.base) return false;
    return JSON.stringify(S.data) !== JSON.stringify(S.base);
  }
  function uniqueId(catId, name) {
    var base = slug(name) || 'item';
    var existing = {};
    items(catId).forEach(function (item) { existing[item.id] = true; });
    var id = base, n = 2;
    while (existing[id]) { id = base + '-' + n; n++; }
    return id;
  }

  /* ---------------------------------------------------------------- toast */

  function toast(message, kind, detail) {
    var host = qs('#toasts');
    var node = document.createElement('div');
    node.className = 'toast ' + (kind || 'info');
    var icon = {
      ok: '<path d="m5 13 4 4L19 7"/>',
      err: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
      warn: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4M12 17v.5"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'
    }[kind || 'info'] || '';
    node.innerHTML = '<svg class="t-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>' +
      '<div class="t-body">' + esc(message) + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</div>';
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { node.remove(); }, 220);
    }, kind === 'err' ? 7000 : 4200);
  }

  /* ---------------------------------------------------------------- login */

  function showLogin(message) {
    qs('#app').hidden = true;
    qs('#login').hidden = false;
    var status = qs('#login-status');
    if (message) {
      status.hidden = false;
      status.textContent = message;
    } else {
      status.hidden = true;
    }
  }

  function fillLoginForm() {
    qs('#login-owner').value = S.cfg.owner || '';
    qs('#login-repo').value = S.cfg.repo || '';
    qs('#login-branch').value = S.cfg.branch || 'main';
    qs('#login-token').value = S.cfg.token || '';
    qs('#login-remember').checked = S.cfg.remember !== false;
  }

  function readLoginForm() {
    S.cfg.owner = qs('#login-owner').value.trim();
    S.cfg.repo = qs('#login-repo').value.trim();
    S.cfg.branch = qs('#login-branch').value.trim() || 'main';
    S.cfg.token = qs('#login-token').value.trim();
    S.cfg.remember = qs('#login-remember').checked;
  }

  async function connectFromLogin() {
    readLoginForm();
    var status = qs('#login-status');
    if (!S.cfg.owner || !S.cfg.repo) {
      status.hidden = false;
      status.textContent = 'Owner and repository are required.';
      return;
    }
    if (!S.cfg.token) {
      status.hidden = false;
      status.textContent = 'A personal access token is required to publish. Use "Work offline" to edit locally.';
      return;
    }
    var btn = qs('#login-connect');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connecting';
    status.hidden = true;
    try {
      await runDiagnostics();
      var critical = S.checks.filter(function (c) { return c.critical; });
      var failed = critical.filter(function (c) { return c.status !== 'ok'; });
      if (failed.length) throw new Error(failed[0].detail || failed[0].name);
      saveCfg();
      await loadFromGitHub();
      enterApp();
      toast('Connected to ' + S.cfg.owner + '/' + S.cfg.repo, 'ok', 'Signed in as ' + (S.user || 'token owner'));
    } catch (err) {
      status.hidden = false;
      status.textContent = err.message;
      showLogin(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  }

  async function runDiagnostics() {
    var checks = [];
    function add(name, status, detail, ms, critical) {
      checks.push({ name: name, status: status, detail: detail, ms: ms, critical: !!critical });
    }

    var net = null;
    try {
      net = await ghRequest('/rate_limit');
    } catch (err) {
      add('api.github.com reachable', 'err', err.message, 0, true);
      S.checks = checks;
      finishDiagnostics(checks);
      return checks;
    }

    if (net.ok) {
      add('api.github.com reachable', 'ok', 'Responded in ' + net.ms + ' ms', net.ms, true);
    } else {
      add('api.github.com reachable', 'err', friendlyError(net), net.ms, true);
      S.checks = checks;
      finishDiagnostics(checks);
      return checks;
    }

    if (S.rate) {
      var low = S.rate.remaining < 100;
      add('API quota', low ? 'warn' : 'ok',
        S.rate.remaining + ' of ' + S.rate.limit + ' requests left' + (S.rate.reset ? ', resets ' + S.rate.reset.toLocaleTimeString() : ''),
        0, false);
    }

    if (!S.cfg.token) {
      add('Personal access token', 'err', 'No token saved. Publishing needs a token with Contents: Read and write.', 0, true);
      S.checks = checks;
      finishDiagnostics(checks);
      return checks;
    }

    var user = await ghRequest('/user');
    if (user.ok) {
      S.user = user.json.login;
      add('Token valid', 'ok', 'Signed in as ' + user.json.login, user.ms, true);
    } else {
      add('Token valid', 'err', friendlyError(user), user.ms, true);
      S.checks = checks;
      finishDiagnostics(checks);
      return checks;
    }

    var repo = await ghRequest(repoPath());
    if (repo.ok) {
      var push = repo.json.permissions ? repo.json.permissions.push : null;
      add('Repository access', push === false ? 'err' : 'ok',
        repo.json.full_name + (repo.json.private ? ' (private)' : ' (public)') + ', default branch ' + repo.json.default_branch,
        repo.ms, true);
      if (repo.json.default_branch && !S.cfg.branch) S.cfg.branch = repo.json.default_branch;
      if (push === false) {
        add('Write permission', 'err', 'The token can read this repository but not push to it. Grant Contents: Read and write.', repo.ms, true);
      } else {
        add('Write permission', 'ok', 'Contents write is available on branch ' + S.cfg.branch, 0, true);
      }
    } else {
      add('Repository access', 'err', friendlyError(repo), repo.ms, true);
      S.checks = checks;
      finishDiagnostics(checks);
      return checks;
    }

    var file = await ghRequest(contentsPath(DATA_PATH) + '?ref=' + encodeURIComponent(S.cfg.branch) + '&t=' + Date.now());
    if (file.ok) {
      add('data.json', 'ok', 'Found on ' + S.cfg.branch + ' (' + Math.round((file.json.size || 0) / 1024 * 10) / 10 + ' KB), sha ' + shortSha(file.json.sha), file.ms, true);
    } else if (file.status === 404) {
      add('data.json', 'warn', 'No data.json on branch ' + S.cfg.branch + '. Publishing will create it.', file.ms, false);
    } else {
      add('data.json', 'err', friendlyError(file), file.ms, true);
    }

    S.checks = checks;
    finishDiagnostics(checks);
    return checks;
  }

  function finishDiagnostics(checks) {
    S.connected = checks.filter(function (c) { return c.critical; }).every(function (c) { return c.status === 'ok'; });
    renderStatusChip();
  }

  async function loadFromGitHub() {
    var file = await readRepoFile(DATA_PATH);
    var parsed;
    try {
      parsed = JSON.parse(file.text);
    } catch (err) {
      throw new Error('data.json on GitHub is not valid JSON. Open it in GitHub and fix the syntax, or restore an earlier commit from History.');
    }
    S.data = normalize(parsed);
    S.base = clone(S.data);
    S.sha = file.sha;
    S.mode = 'github';
    S.lastSync = new Date();
    S.selection = [];
  }

  async function startOffline() {
    try {
      var res = await fetch(DATA_PATH + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var parsed = await res.json();
      S.data = normalize(parsed);
      S.base = clone(S.data);
      S.sha = null;
      S.mode = 'offline';
      S.lastSync = new Date();
      enterApp();
      toast('Offline mode', 'info', 'Edits stay in this browser until you download data.json or connect a token.');
    } catch (err) {
      qs('#login-status').hidden = false;
      qs('#login-status').textContent = 'Could not load data.json (' + err.message + '). Connect a token, or import the file from the Connection page.';
    }
  }

  function enterApp() {
    qs('#login').hidden = true;
    qs('#app').hidden = false;
    S.selection = [];
    if (!isCatView(S.cat)) S.cat = firstCatId();
    renderAll();
  }

  /* ------------------------------------------------------------- rendering */

  function renderAll() {
    renderContentNav();
    renderStatusChip();
    renderView();
  }

  function renderContentNav() {
    var host = qs('#nav-content');
    if (!host) return;
    host.innerHTML = cats().map(function (cat) {
      return '<button class="nav-item" data-view="' + esc(cat.id) + '" type="button">' +
        CAT_ICON +
        '<span class="grow">' + esc(cat.nav || cat.title || cat.id) + '</span>' +
        '<span class="count" id="count-' + esc(cat.id) + '">' + items(cat.id).length + '</span>' +
      '</button>';
    }).join('');
    qsa('.nav-item', host).forEach(function (btn) {
      btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); });
    });
    qsa('.nav-item').forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-view') === S.view);
    });
  }

  function renderStatusChip() {
    var dot = qs('#conn-dot');
    var text = qs('#conn-text');
    if (!dot || !text) return;
    dot.className = 'dot';
    if (S.mode === 'github' && S.connected) {
      dot.classList.add('ok');
      text.textContent = S.cfg.owner + '/' + S.cfg.repo;
      text.title = 'Connected to branch ' + S.cfg.branch;
    } else if (S.mode === 'github') {
      dot.classList.add('err');
      text.textContent = 'Connection problem';
    } else {
      dot.classList.add('warn');
      text.textContent = 'Offline mode';
      text.title = 'Nothing is published until you download data.json or connect a token';
    }
  }

  function updateDirtyPill() {
    var pill = qs('#state-pill');
    if (!pill) return;
    if (isDirty()) {
      pill.className = 'pill dirty';
      pill.textContent = 'Unsaved changes';
    } else {
      pill.className = 'pill';
      pill.textContent = S.mode === 'github' ? 'Synced with GitHub' : 'Offline draft';
    }
  }

  var VIEW_TITLES = {
    overview: 'Overview', history: 'History', site: 'Site settings',
    connection: 'Connection', help: 'Help'
  };

  function renderView() {
    qsa('.view').forEach(function (view) { view.hidden = true; });
    qsa('.nav-item').forEach(function (item) {
      var target = item.getAttribute('data-view');
      var active = target === S.view;
      item.classList.toggle('active', active);
    });

    if (isCatView(S.view)) {
      S.cat = S.view;
      qs('#view-content').hidden = false;
      renderContent();
    } else if (S.view === 'overview') {
      qs('#view-overview').hidden = false;
      renderOverview();
    } else if (S.view === 'site') {
      qs('#view-site').hidden = false;
      renderSite();
    } else if (S.view === 'history') {
      qs('#view-history').hidden = false;
      renderHistory();
    } else if (S.view === 'connection') {
      qs('#view-connection').hidden = false;
      renderConnection();
    } else if (S.view === 'help') {
      qs('#view-help').hidden = false;
      renderHelp();
    }

    var label = VIEW_TITLES[S.view];
    if (!label) {
      var cat = catById(S.view);
      label = cat ? (cat.title || cat.nav) : 'Content';
    }
    qs('#crumbs').innerHTML = '<strong>' + esc(label) + '</strong>';
    updateDirtyPill();
  }

  function setView(view) {
    S.view = view;
    S.selection = [];
    if (qs('#sidebar').classList.contains('open')) qs('#sidebar').classList.remove('open');
    renderView();
    window.scrollTo(0, 0);
  }

  /* -------------------------------------------------------------- overview */

  function renderOverview() {
    var host = qs('#overview-root');
    var perCat = cats().map(function (cat) { return { cat: cat, count: items(cat.id).length }; });
    var total = perCat.reduce(function (sum, row) { return sum + row.count; }, 0);
    var paid = allItems().filter(function (x) { return isPaid(x.item); }).length;
    var hidden = allItems().filter(function (x) { return !!x.item.hidden; }).length;
    var maxCount = Math.max.apply(null, perCat.map(function (r) { return r.count; }).concat([1]));

    var checks = buildHealth();
    var problems = checks.filter(function (c) { return c.status !== 'ok'; }).length;

    if (!S.data) { host.innerHTML = ''; return; }

    qs('#overview-sub').textContent = problems
      ? problems + ' thing' + (problems === 1 ? ' needs' : 's need') + ' attention before the site looks finished.'
      : 'Everything looks healthy. Publish whenever you are ready.';

    var html = '';

    html += '<div class="stat-grid">' +
      statCard('Total items', total, 'ico-grid', '<b>' + perCat.length + '</b> sections live') +
      statCard('Free items', total - paid, 'ico-free', '<b>' + (total - paid) + '</b> of <b>' + total + '</b> listed items') +
      statCard('Paid items', paid, 'ico-tag', paid ? '<b>' + paid + '</b> linked to a store page' : 'Nothing on sale yet') +
      statCard('Hidden', hidden, 'ico-eye', hidden ? 'Not shown on the site' : 'All items visible') +
      '</div>';

    var bars = perCat.map(function (row) {
      var pct = Math.round((row.count / maxCount) * 100);
      var shade = 'g' + ((perCat.indexOf(row) % 3) + 1);
      return '<div class="bar-row ' + shade + '"><div class="bar-label">' + esc(row.cat.nav) + '</div>' +
        '<div class="bar"><span style="width:' + (row.count ? Math.max(pct, 4) : 0) + '%"></span></div>' +
        '<div class="bar-val">' + row.count + '</div></div>';
    }).join('');

    html += '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><div><div class="card-title">Content breakdown</div>' +
        '<div class="card-sub">Items per section, visible and hidden included</div></div>' +
        '<button class="btn btn-sm" data-go="tools">Manage</button></div>' + bars + '</div>' +
      '<div class="card"><div class="card-head"><div><div class="card-title">Health checks</div>' +
        '<div class="card-sub">' + (problems ? problems + ' warning' + (problems === 1 ? '' : 's') : 'All clear') + '</div></div></div>' +
        '<div class="check-list">' + checks.map(checkRow).join('') + '</div></div>' +
    '</div>';

    html += '<div class="card" style="margin-top:14px"><div class="card-head"><div><div class="card-title">Recent activity</div>' +
      '<div class="card-sub">Commits that touched data.json</div></div>' +
      '<button class="btn btn-sm" data-go="history">Open history</button></div>' +
      '<div id="commits-mini">' + commitsMini() + '</div></div>';

    host.innerHTML = html;

    if (S.mode === 'github' && !S.commits) loadCommits(true);
  }

  function statCard(label, value, icon, meta) {
    var icons = {
      'ico-grid': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      'ico-free': '<path d="M12 3v18"/><path d="M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.3 5 1.4 5 3.2-2.2 3-5 3-5-1.1-5-3"/>',
      'ico-tag': '<path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
      'ico-eye': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
    };
    return '<div class="stat"><div class="stat-label">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (icons[icon] || '') + '</svg>' +
      esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-meta">' + meta + '</div></div>';
  }

  function buildHealth() {
    var checks = [];
    var all = allItems();
    var noLink = all.filter(function (x) { return !String(x.item.link || '').trim(); });
    var paidNoLink = noLink.filter(function (x) { return isPaid(x.item); });
    var noDesc = all.filter(function (x) { return !String(x.item.description || '').trim(); });
    var names = {};
    var dupes = [];
    all.forEach(function (x) {
      var key = String(x.item.name || '').trim().toLowerCase();
      if (!key) return;
      if (names[key]) dupes.push(x.item.name); else names[key] = true;
    });
    var hidden = all.filter(function (x) { return !!x.item.hidden; });
    var emptyCats = cats().filter(function (c) { return !items(c.id).length; });

    checks.push({
      status: paidNoLink.length ? 'err' : 'ok',
      title: paidNoLink.length ? paidNoLink.length + ' paid item' + (paidNoLink.length === 1 ? '' : 's') + ' without a link' : 'Every paid item has a link',
      detail: paidNoLink.length ? paidNoLink.map(function (x) { return x.item.name; }).join(', ') : 'Buyers can reach the store page.'
    });
    checks.push({
      status: noLink.length ? 'warn' : 'ok',
      title: noLink.length ? noLink.length + ' item' + (noLink.length === 1 ? '' : 's') + ' show "Coming soon"' : 'All items have a download link',
      detail: noLink.length ? 'Add a link when the file is ready to ship.' : 'Nothing is waiting on a link.'
    });
    checks.push({
      status: noDesc.length ? 'warn' : 'ok',
      title: noDesc.length ? noDesc.length + ' item' + (noDesc.length === 1 ? '' : 's') + ' have no description' : 'Descriptions are complete',
      detail: noDesc.length ? 'Cards look empty without one.' : 'Every card explains itself.'
    });
    checks.push({
      status: dupes.length ? 'err' : 'ok',
      title: dupes.length ? 'Duplicate names found' : 'Names are unique',
      detail: dupes.length ? dupes.join(', ') : 'No two items share a name.'
    });
    checks.push({
      status: hidden.length ? 'warn' : 'ok',
      title: hidden.length ? hidden.length + ' item' + (hidden.length === 1 ? '' : 's') + ' hidden from the site' : 'Everything is visible',
      detail: hidden.length ? hidden.map(function (x) { return x.item.name; }).join(', ') : 'Visitors see the full catalogue.'
    });
    if (emptyCats.length) {
      checks.push({
        status: 'warn',
        title: 'Empty sections: ' + emptyCats.map(function (c) { return c.nav; }).join(', '),
        detail: 'Empty sections are hidden automatically on the site.'
      });
    }
    return checks;
  }

  function checkRow(check) {
    var icon = check.status === 'ok'
      ? '<path d="m5 13 4 4L19 7"/>'
      : check.status === 'warn'
        ? '<path d="M12 7v6M12 16.5v.5"/>'
        : '<path d="M6 6l12 12M18 6 6 18"/>';
    return '<div class="check ' + check.status + '"><div class="check-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></div>' +
      '<div class="check-body"><b>' + esc(check.title) + '</b><span>' + esc(check.detail) + '</span></div></div>';
  }

  /* --------------------------------------------------------------- content */

  function renderContent() {
    var cat = catById(S.cat) || { id: S.cat, nav: S.cat, title: S.cat, blurb: '' };
    qs('#content-title').textContent = cat.title || cat.nav;
    var total = items(S.cat).length;
    var hidden = items(S.cat).filter(function (i) { return i.hidden; }).length;
    qs('#content-sub').textContent = total + ' item' + (total === 1 ? '' : 's') +
      (hidden ? ', ' + hidden + ' hidden' : '') + (cat.blurb ? ' - ' + cat.blurb : '');

    var host = qs('#content-root');
    host.innerHTML =
      '<div class="toolbar">' +
        '<div class="search-box">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input class="input" id="content-search" placeholder="Search in ' + esc(cat.nav) + '..." value="' + esc(S.q) + '" autocomplete="off">' +
        '</div>' +
        '<div class="seg" id="content-seg">' +
          segBtn('all', 'All') + segBtn('free', 'Free') + segBtn('paid', 'Paid') + segBtn('hidden', 'Hidden') +
        '</div>' +
        '<select class="select" id="content-sort" style="width:auto;min-width:150px">' +
          '<option value="manual"' + (S.sort === 'manual' ? ' selected' : '') + '>Manual order</option>' +
          '<option value="name"' + (S.sort === 'name' ? ' selected' : '') + '>Name A-Z</option>' +
          '<option value="updated"' + (S.sort === 'updated' ? ' selected' : '') + '>Recently updated</option>' +
          '<option value="price"' + (S.sort === 'price' ? ' selected' : '') + '>Price</option>' +
        '</select>' +
      '</div>' +
      '<div id="bulkbar"></div>' +
      '<div id="content-table"></div>';

    renderTable();
  }

  function segBtn(mode, label) {
    return '<button type="button" data-filter="' + mode + '" class="' + (S.filter === mode ? 'active' : '') + '">' + label + '</button>';
  }

  function filteredRows() {
    var rows = items(S.cat).map(function (item, index) { return { item: item, index: index }; });

    rows = rows.filter(function (row) {
      if (S.filter === 'free' && isPaid(row.item)) return false;
      if (S.filter === 'paid' && !isPaid(row.item)) return false;
      if (S.filter === 'hidden' && !row.item.hidden) return false;
      if (S.q) {
        var hay = [row.item.name, row.item.description, row.item.version, row.item.link]
          .concat(row.item.features || []).concat(row.item.tags || []).join(' ').toLowerCase();
        if (hay.indexOf(S.q.toLowerCase()) === -1) return false;
      }
      return true;
    });

    if (S.sort === 'name') rows.sort(function (a, b) { return String(a.item.name).localeCompare(String(b.item.name)); });
    if (S.sort === 'updated') rows.sort(function (a, b) { return String(b.item.updated || '').localeCompare(String(a.item.updated || '')); });
    if (S.sort === 'price') rows.sort(function (a, b) { return (isPaid(b.item) ? 1 : 0) - (isPaid(a.item) ? 1 : 0); });
    return rows;
  }

  function renderTable() {
    var host = qs('#content-table');
    var rows = filteredRows();
    var total = items(S.cat).length;

    renderBulkBar(rows.length);

    if (!total) {
      host.innerHTML = '<div class="table-wrap"><div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16v13H4z"/><path d="M4 11h16M9 7V4h6v3"/></svg>' +
        '<b>No items in this section yet</b>Add the first one and it appears on the site immediately.' +
        '<div style="margin-top:14px"><button class="btn btn-primary btn-sm" data-new="' + esc(S.cat) + '">Add first item</button></div>' +
        '</div></div>';
      return;
    }

    if (!rows.length) {
      host.innerHTML = '<div class="table-wrap"><div class="empty">No items match this filter.' +
        '<div style="margin-top:12px"><button class="btn btn-sm" data-clear>Clear filters</button></div></div></div>';
      return;
    }

    var head = '<tr>' +
      '<th class="check-cell"><input type="checkbox" class="cb" id="select-all" ' + (rows.length && rows.every(function (r) { return S.selection.indexOf(r.item.id) !== -1; }) ? 'checked' : '') + '></th>' +
      '<th>Item</th><th style="width:110px">Price</th><th style="width:150px">Link</th>' +
      '<th style="width:120px">Status</th><th style="width:170px"></th></tr>';

    var body = rows.map(function (row) {
      var item = row.item;
      var selected = S.selection.indexOf(item.id) !== -1;

      var meta = [];
      if (item.version) meta.push('<span class="tag">' + esc(item.version) + '</span>');
      (item.tags || []).slice(0, 2).forEach(function (tag) { meta.push('<span class="tag dim">' + esc(tag) + '</span>'); });
      if (item.updated) meta.push('<span class="dim">' + esc(formatDate(item.updated)) + '</span>');

      var link = String(item.link || '').trim();
      var linkCell = link
        ? '<span class="tag green" title="' + esc(link) + '">Linked</span>'
        : '<span class="tag dim">Coming soon</span>';

      var status = [];
      if (item.hidden) status.push('<span class="tag">Hidden</span>');
      if (item.featured) status.push('<span class="tag gold">Featured</span>');
      if (!status.length) status.push('<span class="tag blue">Live</span>');

      return '<tr data-id="' + esc(item.id) + '" draggable="true" class="' + (selected ? 'selected ' : '') + (item.hidden ? 'hidden-row' : '') + '">' +
        '<td class="check-cell"><input type="checkbox" class="cb" data-select="' + esc(item.id) + '"' + (selected ? ' checked' : '') + '></td>' +
        '<td><div class="cell-item"><div class="item-icon">' + esc(item.icon || '\uD83C\uDFAE') + '</div><div style="min-width:0">' +
          '<div class="item-name">' + esc(item.name || 'Untitled') + '</div>' +
          '<div class="item-meta">' + meta.join('') + '</div></div></div></td>' +
        '<td>' + (isPaid(item)
          ? '<span class="tag red">' + esc(item.price) + '</span>'
          : '<span class="tag gold">Free</span>') + '</td>' +
        '<td>' + linkCell + '</td>' +
        '<td>' + status.join(' ') + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="btn-icon" data-act="up" data-id="' + esc(item.id) + '" title="Move up">' + icon('up') + '</button>' +
          '<button class="btn-icon" data-act="down" data-id="' + esc(item.id) + '" title="Move down">' + icon('down') + '</button>' +
          '<button class="btn-icon" data-act="edit" data-id="' + esc(item.id) + '" title="Edit">' + icon('edit') + '</button>' +
          '<button class="btn-icon" data-act="copy" data-id="' + esc(item.id) + '" title="Duplicate">' + icon('copy') + '</button>' +
          '<button class="btn-icon" data-act="del" data-id="' + esc(item.id) + '" title="Delete">' + icon('trash') + '</button>' +
        '</div></td></tr>';
    }).join('');

    host.innerHTML = '<div class="table-wrap"><div class="table-scroll"><table class="table"><thead>' +
      head + '</thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function renderBulkBar(visibleCount) {
    var host = qs('#bulkbar');
    if (!S.selection.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="bulkbar"><b>' + S.selection.length + '</b> selected' +
      '<span class="dim">of ' + visibleCount + ' shown</span><div class="spacer"></div>' +
      '<button class="btn btn-sm" data-bulk="feature">Feature</button>' +
      '<button class="btn btn-sm" data-bulk="unfeature">Unfeature</button>' +
      '<button class="btn btn-sm" data-bulk="hide">Hide</button>' +
      '<button class="btn btn-sm" data-bulk="show">Show</button>' +
      '<button class="btn btn-sm btn-danger" data-bulk="delete">Delete</button>' +
      '</div>';
  }

  var ICONS = {
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
    check: '<path d="m5 13 4 4L19 7"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  /* ---------------------------------------------------------- site settings */

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var target = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  function renderSite() {
    var site = S.data.site;
    var host = qs('#site-root');
    var social = site.social || {};

    function socialInput(key, label, placeholder) {
      return '<div class="field" style="margin-top:10px"><label>' + label + '</label>' +
        '<input class="input" data-field="site.social.' + key + '" value="' + esc(social[key] || '') + '" placeholder="' + esc(placeholder) + '" spellcheck="false"></div>';
    }

    var sections = cats().map(function (cat, index) {
      return '<div class="card" style="margin-bottom:10px" data-catcard="' + esc(cat.id) + '">' +
        '<div class="card-head"><div><div class="card-title">' + esc(cat.nav) + '</div>' +
          '<div class="card-sub">' + items(cat.id).length + ' item' + (items(cat.id).length === 1 ? '' : 's') + '</div></div>' +
          '<div class="row">' +
            '<button class="btn-icon" data-order="' + esc(cat.id) + '" data-dir="-1" title="Move up" ' + (index === 0 ? 'disabled' : '') + '>' + icon('up') + '</button>' +
            '<button class="btn-icon" data-order="' + esc(cat.id) + '" data-dir="1" title="Move down" ' + (index === cats().length - 1 ? 'disabled' : '') + '>' + icon('down') + '</button>' +
            '<button class="btn-icon danger" data-cat-action="delete" data-cat-id="' + esc(cat.id) + '" title="Delete this section">' + icon('trash') + '</button>' +
          '</div></div>' +
        '<div class="form-row">' +
          '<div class="field"><label>Nav label</label><input class="input" data-cat="' + esc(cat.id) + '" data-catfield="nav" value="' + esc(cat.nav) + '"></div>' +
          '<div class="field"><label>Section title</label><input class="input" data-cat="' + esc(cat.id) + '" data-catfield="title" value="' + esc(cat.title) + '"></div>' +
        '</div>' +
        '<div class="field" style="margin-top:10px"><label>Short description</label>' +
          '<input class="input" data-cat="' + esc(cat.id) + '" data-catfield="blurb" value="' + esc(cat.blurb || '') + '" placeholder="One line shown under the section title"></div>' +
        '</div>';
    }).join('');

    host.innerHTML =
      '<div class="grid-2">' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="card-title">Identity</div><div class="card-sub">Hero and about text</div></div></div>' +
            '<div class="form-row">' +
              '<div class="field"><label>Site title</label><input class="input" data-field="site.title" value="' + esc(site.title) + '"></div>' +
              '<div class="field"><label>Tagline</label><input class="input" data-field="site.tagline" value="' + esc(site.tagline) + '"></div>' +
            '</div>' +
            '<div class="field" style="margin-top:10px"><label>Subtitle</label><input class="input" data-field="site.subtitle" value="' + esc(site.subtitle) + '"></div>' +
            '<div class="field" style="margin-top:10px"><label>About paragraph</label><textarea class="textarea" data-field="site.about">' + esc(site.about) + '</textarea></div>' +
            '<div class="field" style="margin-top:10px"><label>Footer text</label><input class="input" data-field="site.footer" value="' + esc(site.footer) + '"></div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="card-title">Announcement bar</div>' +
              '<div class="card-sub">A thin gold strip above the hero</div></div>' +
              '<label class="switch"><input type="checkbox" data-field="site.announcementEnabled"' + (site.announcementEnabled ? ' checked' : '') + '><span class="track"></span></label></div>' +
            '<div class="field"><textarea class="textarea" data-field="site.announcement" placeholder="e.g. SVR 2011 Move Pack v23 is out now">' + esc(site.announcement) + '</textarea></div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="card-title">Social links</div><div class="card-sub">Empty fields are hidden on the site</div></div></div>' +
            socialInput('discord', 'Discord invite', 'https://discord.gg/...') +
            socialInput('telegram', 'Telegram channel', 'https://t.me/ps2eater') +
            socialInput('x', 'X (Twitter)', 'https://x.com/...') +
            socialInput('tiktok', 'TikTok', 'https://www.tiktok.com/@...') +
            socialInput('facebook', 'Facebook page', 'https://www.facebook.com/...') +
            socialInput('patreon', 'Patreon', 'https://www.patreon.com/...') +
            socialInput('github', 'GitHub', 'https://github.com/ps2eater') +
            socialInput('itch', 'itch.io', 'https://amheroher.itch.io') +
          '</div>' +
        '</div>' +
        '<div class="stack">' +
          '<div class="card"><div class="card-head"><div><div class="card-title">Sections</div>' +
            '<div class="card-sub">Order and labels used across the site</div></div>' +
            '<button class="btn btn-sm" id="btn-site-add-section" type="button">' + icon('plus') + 'Add section</button></div>' +
            sections + '</div>' +
          '<div class="card"><div class="card-title">Tips</div>' +
            '<div class="check-list" style="margin-top:10px">' +
              checkRow({ status: 'ok', title: 'Changes are drafts', detail: 'Nothing goes live until you press Publish.' }) +
              checkRow({ status: 'ok', title: 'Empty sections hide themselves', detail: 'Delete every item in a section and it disappears from the site.' }) +
              checkRow({ status: 'warn', title: 'Keep the tagline short', detail: 'It is rendered in uppercase with wide letter spacing.' }) +
            '</div></div>' +
        '</div>' +
      '</div>';
  }

  /* --------------------------------------------------------------- commits */

  async function loadCommits(silent) {
    if (S.mode !== 'github') {
      S.commits = [];
      if (!silent) toast('History needs a GitHub connection', 'warn');
      if (S.view === 'history') renderHistory();
      return;
    }
    S.commits = S.commits || null;
    if (S.view === 'history') renderHistory();
    try {
      var list = await gh(repoPath() + '/commits?path=' + encodeURIComponent(DATA_PATH) +
        '&sha=' + encodeURIComponent(S.cfg.branch) + '&per_page=25');
      S.commits = (list || []).map(function (c) {
        return {
          sha: c.sha,
          message: (c.commit && c.commit.message || 'No message').split('\n')[0],
          date: c.commit && c.commit.author ? c.commit.author.date : '',
          author: (c.author && c.author.login) || (c.commit && c.commit.author && c.commit.author.name) || 'unknown',
          url: c.html_url
        };
      });
    } catch (err) {
      S.commits = S.commits || [];
      if (!silent) toast('Could not load history', 'err', err.message);
      S.commitError = err.message;
    }
    if (S.view === 'history') renderHistory();
    if (S.view === 'overview') {
      var mini = qs('#commits-mini');
      if (mini) mini.innerHTML = commitsMini();
    }
  }

  function commitsMini() {
    if (!S.commits) {
      return '<div class="muted" style="font-size:12.5px">' +
        (S.mode === 'github' ? 'Loading commits...' : 'Connect a token to see commit history.') + '</div>';
    }
    if (!S.commits.length) return '<div class="muted" style="font-size:12.5px">No commits yet.</div>';
    return S.commits.slice(0, 4).map(function (c) {
      return '<div class="commit-row"><div class="commit-dot"></div><div class="commit-main">' +
        '<div class="commit-msg">' + esc(c.message) + '</div>' +
        '<div class="commit-meta"><span class="mono">' + esc(shortSha(c.sha)) + '</span>' +
        '<span>' + esc(timeAgo(c.date)) + '</span><span>' + esc(c.author) + '</span></div></div>' +
        '<a class="btn btn-sm" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open</a></div>';
    }).join('');
  }

  function renderHistory() {
    var host = qs('#history-root');
    if (S.mode !== 'github') {
      host.innerHTML = '<div class="card"><div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>' +
        '<b>History needs a GitHub connection</b>Version history is read from the repository, so it is unavailable in offline mode.' +
        '<div style="margin-top:14px"><button class="btn btn-sm" data-go="connection">Open connection</button></div></div></div>';
      return;
    }
    if (!S.commits) {
      host.innerHTML = '<div class="card"><div class="muted">Loading commits...</div></div>';
      loadCommits(true);
      return;
    }
    if (S.commitError) {
      host.innerHTML = '<div class="card"><div class="empty"><b>Could not read history</b>' + esc(S.commitError) +
        '<div style="margin-top:14px"><button class="btn btn-sm" id="btn-history-retry">Retry</button></div></div></div>';
      return;
    }
    if (!S.commits.length) {
      host.innerHTML = '<div class="card"><div class="empty"><b>No commits yet</b>Publish once and the first entry shows up here.</div></div>';
      return;
    }

    var current = '<div class="banner-strip" style="background:rgba(62,207,142,.06);border-color:rgba(62,207,142,.2);color:#7bd9b0">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 13 4 4L19 7"/></svg>' +
      '<span>Loaded version <span class="mono">' + esc(shortSha(S.sha)) + '</span> from <b>' + esc(S.cfg.branch) + '</b>' +
      (S.lastSync ? ' at ' + esc(S.lastSync.toLocaleTimeString()) : '') + '</span></div>';

    host.innerHTML = current + '<div class="table-wrap" style="padding:6px 18px">' +
      S.commits.map(function (c) {
        var isCurrent = S.sha && c.sha === S.sha;
        return '<div class="commit-row">' +
          '<div class="commit-dot" style="' + (isCurrent ? 'background:var(--green);opacity:1' : '') + '"></div>' +
          '<div class="commit-main"><div class="commit-msg">' + esc(c.message) + '</div>' +
            '<div class="commit-meta"><span class="mono">' + esc(shortSha(c.sha)) + '</span>' +
            '<span>' + esc(formatDate(c.date)) + '</span><span>' + esc(c.author) + '</span>' +
            (isCurrent ? '<span class="tag green">Live</span>' : '') + '</div></div>' +
          '<div class="row">' +
            (isCurrent ? '' : '<button class="btn btn-sm" data-restore="' + esc(c.sha) + '">Restore</button>') +
            '<a class="btn btn-sm btn-ghost" href="' + esc(c.url) + '" target="_blank" rel="noopener">Diff</a>' +
          '</div></div>';
      }).join('') + '</div>';
  }

  async function restoreCommit(sha) {
    var ok = await confirmDialog(
      'Restore this version?',
      'data.json from commit ' + shortSha(sha) + ' replaces your current draft. Nothing is published until you press Publish.',
      'Load version'
    );
    if (!ok) return;
    try {
      var file = await readRepoFile(DATA_PATH, sha);
      var parsed;
      try { parsed = JSON.parse(file.text); } catch (e) { throw new Error('That version of data.json is not valid JSON.'); }
      S.data = normalize(parsed);
      S.selection = [];
      renderAll();
      setView('overview');
      toast('Version ' + shortSha(sha) + ' loaded into the editor', 'ok', 'Publish to make it live.');
    } catch (err) {
      toast('Restore failed', 'err', err.message);
    }
  }

  /* ------------------------------------------------------------ connection */

  function renderConnection() {
    var host = qs('#connection-root');
    var rate = S.rate;
    var checks = S.checks.length ? S.checks : [];

    var checksHtml = checks.length
      ? checks.map(function (c) {
        return '<div class="check ' + c.status + '"><div class="check-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
          (c.status === 'ok' ? '<path d="m5 13 4 4L19 7"/>' : c.status === 'warn' ? '<path d="M12 7v6M12 16.5v.5"/>' : '<path d="M6 6l12 12M18 6 6 18"/>') +
          '</svg></div><div class="check-body"><b>' + esc(c.name) + '</b><span>' + esc(c.detail) + '</span></div>' +
          (c.ms ? '<span class="dim mono">' + c.ms + 'ms</span>' : '') + '</div>';
      }).join('')
      : '<div class="empty" style="padding:26px 10px"><b>No checks yet</b>Run a test to see every request the dashboard makes.</div>';

    host.innerHTML =
      '<div class="grid-2">' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="card-title">Repository</div>' +
              '<div class="card-sub">Where the site is served from</div></div>' +
              (S.mode === 'github' && S.connected ? '<span class="tag green">Connected</span>' : '<span class="tag dim">Offline</span>') +
            '</div>' +
            '<div class="form-row">' +
              '<div class="field"><label>Owner</label><input class="input" id="c-owner" value="' + esc(S.cfg.owner) + '" spellcheck="false"></div>' +
              '<div class="field"><label>Repository</label><input class="input" id="c-repo" value="' + esc(S.cfg.repo) + '" spellcheck="false"></div>' +
            '</div>' +
            '<div class="form-row" style="margin-top:10px">' +
              '<div class="field"><label>Branch</label><input class="input" id="c-branch" value="' + esc(S.cfg.branch) + '" spellcheck="false"></div>' +
              '<div class="field"><label>Data file</label><input class="input" value="' + DATA_PATH + '" readonly></div>' +
            '</div>' +
            '<div class="field" style="margin-top:10px"><label>Personal access token</label>' +
              '<div class="input-affix"><input class="input" id="c-token" type="password" value="' + esc(S.cfg.token) + '" spellcheck="false" placeholder="github_pat_...">' +
              '<button class="btn-icon" type="button" id="c-token-toggle" title="Show token">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div>' +
              '<span class="hint">Fine-grained token, repository access limited to ' + esc(S.cfg.repo) + ', permission <b>Contents: Read and write</b>.</span>' +
            '</div>' +
            '<div class="row" style="margin-top:14px;flex-wrap:wrap">' +
              '<button class="btn btn-primary" data-conn="save">Save and test</button>' +
              '<button class="btn" data-conn="reload">Reload from GitHub</button>' +
              '<button class="btn btn-ghost" data-conn="forget">Forget token</button>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="card-title">Offline tools</div>' +
              '<div class="card-sub">Work without a token, then upload data.json yourself</div></div></div>' +
            '<div class="row" style="flex-wrap:wrap">' +
              '<button class="btn btn-sm" data-conn="import">Import data.json</button>' +
              '<button class="btn btn-sm" data-conn="download">Download JSON</button>' +
              '<button class="btn btn-sm" data-conn="copy">Copy JSON</button>' +
            '</div>' +
            '<p class="hint" style="margin-top:12px">Offline edits live in this browser tab. Download the file and replace <code class="mono">data.json</code> in the repository to publish them.</p>' +
          '</div>' +
        '</div>' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="card-title">Diagnostics</div>' +
              '<div class="card-sub">' + (checks.length ? checks.length + ' checks, last run ' + esc(S.lastDiag ? timeAgo(S.lastDiag) : 'just now') : 'Not run yet') + '</div></div>' +
              '<button class="btn btn-sm" data-conn="test">Run again</button></div>' +
            '<div class="check-list">' + checksHtml + '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-title">API quota</div>' +
            (rate
              ? '<div class="stat-value" style="font-size:22px;margin-top:10px">' + rate.remaining + ' <span class="dim" style="font-size:13px;font-weight:600">/ ' + rate.limit + '</span></div>' +
                '<div class="stat-meta">' + (rate.reset ? 'Resets at ' + esc(rate.reset.toLocaleTimeString()) : 'Resets hourly') + '</div>'
              : '<div class="muted" style="font-size:12.5px;margin-top:8px">Run a test to read the current quota.</div>') +
            '<div class="hint" style="margin-top:12px">Unauthenticated requests are limited to 60 per hour. A token raises this to 5000.</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ help */

  function renderHelp() {
    var host = qs('#help-root');
    host.innerHTML =
      '<div class="grid-2">' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-title">First time setup</div>' +
            '<div style="margin-top:12px">' +
              helpStep(1, 'Create a fine-grained token', 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Set repository access to <b>Only select repositories</b> and pick <span class="mono">' + esc(S.cfg.repo) + '</span>.') +
              helpStep(2, 'Grant Contents access', 'Under Repository permissions, set <b>Contents</b> to <b>Read and write</b>. Nothing else is needed.') +
              helpStep(3, 'Connect the dashboard', 'Paste the token on the login screen. It is stored in this browser only and used for api.github.com requests.') +
              helpStep(4, 'Edit and publish', 'Changes stay local until you press <b>Publish</b>. Publish writes data.json with a commit message, and GitHub Pages redeploys in about a minute.') +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-title">Keyboard shortcuts</div>' +
            '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--muted)">' +
              '<div class="row"><span class="kbd">Ctrl</span><span class="kbd">S</span><span style="margin-left:6px">Open publish dialog</span></div>' +
              '<div class="row"><span class="kbd">N</span><span style="margin-left:6px">New item in the current section</span></div>' +
              '<div class="row"><span class="kbd">/</span><span style="margin-left:6px">Focus the search field</span></div>' +
              '<div class="row"><span class="kbd">Esc</span><span style="margin-left:6px">Close editor, dialog or menu</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card-title">When a request fails</div>' +
            '<div style="margin-top:12px;display:flex;flex-direction:column;gap:12px;font-size:12.5px;color:var(--muted)">' +
              trouble('Could not reach api.github.com', 'The browser could not open a connection. Disable VPN or ad blockers for this tab, check the firewall, then press <b>Run again</b> on the Connection page.') +
              trouble('Token rejected (401)', 'The token was revoked, expired, or copied with a typo. Generate a new one and paste it again.') +
              trouble('Access denied (403)', 'The token can see the repo but not write to it. Set Contents to Read and write for this specific repository.') +
              trouble('Conflict (409)', 'data.json changed on GitHub while you were editing (another tab, another device, or the GitHub web editor). Reload, merge your changes, then publish.') +
              trouble('Rate limit reached', 'You made more than 5000 API calls in an hour. Wait for the reset time on the Connection page; reading the site still works.') +
              trouble('Site shows old content', 'GitHub Pages caches for about a minute. Hard refresh with Ctrl+F5, or check the Actions tab for the deployment status.') +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-title">Files in this project</div>' +
            '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--muted)">' +
              '<div><span class="mono" style="color:var(--gold)">index.html</span> - public site, renders data.json</div>' +
              '<div><span class="mono" style="color:var(--gold)">data.json</span> - all content, the single source of truth</div>' +
              '<div><span class="mono" style="color:var(--gold)">admin.html</span> - this dashboard</div>' +
              '<div><span class="mono" style="color:var(--gold)">assets/</span> - uploaded item images</div>' +
            '</div>' +
            '<div class="hint" style="margin-top:14px">Everything is static. No server, database or build step, so it stays free on GitHub Pages.</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function helpStep(number, title, body) {
    return '<div class="help-step"><div class="help-num">' + number + '</div><div><b>' + title + '</b><p>' + body + '</p></div></div>';
  }

  function trouble(title, body) {
    return '<div><div style="color:var(--text);font-weight:600;margin-bottom:2px">' + esc(title) + '</div><div>' + body + '</div></div>';
  }

  /* ----------------------------------------------------------------- modal */

  function openModal(opts) {
    qs('#modal-title').textContent = opts.title || '';
    qs('#modal-sub').textContent = opts.sub || '';
    qs('#modal-body').innerHTML = opts.body || '';
    var foot = qs('#modal-foot');
    foot.innerHTML = '';
    (opts.actions || []).forEach(function (action) {
      if (action.spacer) {
        var spacer = document.createElement('div');
        spacer.className = 'spacer';
        foot.appendChild(spacer);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (action.kind || '');
      btn.innerHTML = action.label;
      if (action.disabled) btn.disabled = true;
      btn.addEventListener('click', function () {
        if (action.keepOpen) {
          if (action.onClick) action.onClick(btn);
          return;
        }
        if (action.onClick) action.onClick(btn);
        closeModal();
      });
      foot.appendChild(btn);
    });
    qs('#modal').classList.add('show');
  }

  function closeModal() {
    qs('#modal').classList.remove('show');
    qs('#modal-body').innerHTML = '';
    qs('#modal-foot').innerHTML = '';
    if (S.modalResolve) {
      var resolve = S.modalResolve;
      S.modalResolve = null;
      resolve(false);
    }
  }

  function confirmDialog(title, sub, confirmLabel, danger) {
    return new Promise(function (resolve) {
      S.modalResolve = resolve;
      openModal({
        title: title,
        sub: sub || '',
        body: '',
        actions: [
          { label: 'Cancel', kind: 'btn-ghost', spacer: true, onClick: function () { S.modalResolve = null; resolve(false); } },
          { label: confirmLabel || 'Confirm', kind: danger ? 'btn-danger' : 'btn-primary', onClick: function () { S.modalResolve = null; resolve(true); } }
        ]
      });
    });
  }

  /* ---------------------------------------------------------------- editor */

  function fillCategorySelect() {
    var select = qs('#f-cat');
    select.innerHTML = cats().map(function (cat) {
      return '<option value="' + esc(cat.id) + '"' + (cat.id === S.draftCat ? ' selected' : '') + '>' + esc(cat.nav) + '</option>';
    }).join('');
  }

  function renderEmojiGrid() {
    qs('#emoji-grid').innerHTML = EMOJIS.map(function (emoji) {
      return '<button type="button" data-emoji="' + esc(emoji) + '">' + emoji + '</button>';
    }).join('');
  }

  function renderChips(containerId, field) {
    if (!S.draft) return;
    var container = qs('#' + containerId);
    qsa('.chip-item', container).forEach(function (node) { node.remove(); });
    var input = container.querySelector('input');
    (S.draft[field] || []).forEach(function (value, index) {
      var chip = document.createElement('span');
      chip.className = 'chip-item';
      chip.innerHTML = esc(value) + '<button type="button" data-chip-remove="' + index + '" aria-label="Remove ' + esc(value) + '">&times;</button>';
      container.insertBefore(chip, input);
    });
  }

  function openEditor(catId, itemId) {
    if (!isCatView(catId)) catId = isCatView(S.cat) ? S.cat : firstCatId();
    S.draftCat = catId;
    var list = items(S.draftCat);
    var index = -1;
    if (itemId) {
      index = list.findIndex(function (i) { return i.id === itemId; });
    }
    S.draftIndex = index;
    S.draft = index >= 0 ? clone(list[index]) : {
      id: '', name: '', version: '', icon: '\uD83C\uDFAE', description: '', features: [], tags: [],
      price: 'free', link: '', image: '', featured: false, hidden: false, updated: todayISO()
    };
    S.draft.features = Array.isArray(S.draft.features) ? S.draft.features.slice() : [];
    S.draft.tags = Array.isArray(S.draft.tags) ? S.draft.tags.slice() : [];

    fillCategorySelect();
    qs('#drawer-title').textContent = index >= 0 ? 'Edit item' : 'New item';
    qs('#drawer-delete').hidden = index < 0;
    qs('#f-name').value = S.draft.name || '';
    qs('#f-version').value = S.draft.version || '';
    qs('#f-icon').value = S.draft.icon || '';
    qs('#f-desc').value = S.draft.description || '';
    qs('#f-link').value = S.draft.link || '';
    qs('#f-image').value = S.draft.image || '';
    qs('#f-featured').checked = !!S.draft.featured;
    qs('#f-hidden').checked = !!S.draft.hidden;
    qs('#f-price-mode').value = isPaid(S.draft) ? 'paid' : 'free';
    qs('#f-price').value = isPaid(S.draft) ? S.draft.price : '';
    qs('#f-name').classList.remove('invalid');
    qs('#f-name-hint').textContent = '';
    qs('#f-name-hint').className = 'hint';

    renderChips('f-features', 'features');
    renderChips('f-tags', 'tags');
    qsa('#emoji-grid button').forEach(function (btn) {
      btn.classList.toggle('picked', btn.getAttribute('data-emoji') === S.draft.icon);
    });

    updatePriceVisibility();
    updateImagePreview();

    qs('#overlay').classList.add('show');
    qs('#drawer').classList.add('open');
    setTimeout(function () { qs('#f-name').focus(); }, 80);
  }

  function closeEditor() {
    qs('#drawer').classList.remove('open');
    qs('#overlay').classList.remove('show');
    S.draft = null;
    S.draftIndex = -1;
  }

  function updatePriceVisibility() {
    qs('#f-price-wrap').hidden = qs('#f-price-mode').value !== 'paid';
  }

  function updateImagePreview() {
    var url = qs('#f-image').value.trim();
    qs('#f-image-preview').innerHTML = url
      ? '<img src="' + esc(url) + '" alt="" onerror="this.parentNode.textContent=\'?\';this.remove()">'
      : '+';
  }

  function saveEditor() {
    if (!S.draft) return;
    var name = qs('#f-name').value.trim();
    if (!name) {
      qs('#f-name').classList.add('invalid');
      qs('#f-name-hint').textContent = 'Give the item a name so it can be listed.';
      qs('#f-name-hint').className = 'hint error';
      qs('#f-name').focus();
      return;
    }
    var targetCat = qs('#f-cat').value;
    var paid = qs('#f-price-mode').value === 'paid';
    var price = paid ? (qs('#f-price').value.trim() || '$0') : 'free';
    var item = {
      id: S.draft.id || uniqueId(targetCat, name),
      name: name,
      version: qs('#f-version').value.trim(),
      icon: qs('#f-icon').value.trim() || '\uD83C\uDFAE',
      description: qs('#f-desc').value.trim(),
      features: (S.draft.features || []).slice(),
      tags: (S.draft.tags || []).slice(),
      price: price,
      link: qs('#f-link').value.trim(),
      image: qs('#f-image').value.trim(),
      featured: qs('#f-featured').checked,
      hidden: qs('#f-hidden').checked,
      updated: todayISO()
    };

    if (S.draftIndex >= 0) {
      if (targetCat === S.draftCat) {
        S.data[targetCat][S.draftIndex] = item;
      } else {
        S.data[S.draftCat].splice(S.draftIndex, 1);
        S.data[targetCat].push(item);
      }
    } else {
      S.data[targetCat].push(item);
    }

    var wasEditing = S.draftIndex >= 0;
    closeEditor();
    S.view = targetCat;
    S.cat = targetCat;
    renderAll();
    toast(wasEditing ? 'Item saved' : 'Item added', 'ok', name + ' is in your draft. Publish to push it live.');
  }

  async function deleteItemById(catId, id) {
    var list = items(catId);
    var index = list.findIndex(function (i) { return i.id === id; });
    if (index < 0) return;
    var item = list[index];
    var ok = await confirmDialog('Delete "' + item.name + '"?', 'The item leaves your draft right away. The live site changes only after you publish.', 'Delete', true);
    if (!ok) return;
    closeEditor();
    list.splice(index, 1);
    S.selection = S.selection.filter(function (x) { return x !== id; });
    renderAll();
    toast('Deleted ' + item.name, 'ok', 'Publish to remove it from the site.');
  }

  function duplicateItem(id) {
    var list = items(S.cat);
    var index = list.findIndex(function (i) { return i.id === id; });
    if (index < 0) return;
    var copy = clone(list[index]);
    copy.id = uniqueId(S.cat, copy.name + ' copy');
    copy.name = copy.name + ' (copy)';
    copy.updated = todayISO();
    list.splice(index + 1, 0, copy);
    renderAll();
    toast('Duplicated ' + list[index].name, 'ok', 'Edit the copy to change its details.');
  }

  function moveItem(id, direction) {
    var list = items(S.cat);
    var index = list.findIndex(function (i) { return i.id === id; });
    var target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    if (S.sort !== 'manual') {
      toast('Switch sorting to "Manual order" to move items', 'warn');
      return;
    }
    var swapped = list[index];
    list[index] = list[target];
    list[target] = swapped;
    renderTable();
    updateDirtyPill();
  }

  function reorderItem(dragId, targetId) {
    if (S.sort !== 'manual') {
      toast('Switch sorting to "Manual order" to drag items', 'warn');
      return;
    }
    var list = items(S.cat);
    var from = list.findIndex(function (i) { return i.id === dragId; });
    var to = list.findIndex(function (i) { return i.id === targetId; });
    if (from < 0 || to < 0 || from === to) return;
    var moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    renderTable();
    updateDirtyPill();
  }

  /* --------------------------------------------------------------- publish */

  function buildDiff() {
    var changes = [];
    var base = S.base || {};
    cats().forEach(function (cat) {
      var before = Array.isArray(base[cat.id]) ? base[cat.id] : [];
      var after = items(cat.id);
      var beforeIds = {};
      var afterIds = {};
      before.forEach(function (item) { beforeIds[item.id] = item; });
      after.forEach(function (item) { afterIds[item.id] = item; });
      after.forEach(function (item) {
        if (!beforeIds[item.id]) changes.push({ type: 'add', label: item.name, where: cat.nav });
        else if (JSON.stringify(beforeIds[item.id]) !== JSON.stringify(item)) changes.push({ type: 'mod', label: item.name, where: cat.nav });
      });
      before.forEach(function (item) {
        if (!afterIds[item.id]) changes.push({ type: 'del', label: item.name, where: cat.nav });
      });
    });
    if (JSON.stringify(base.site || {}) !== JSON.stringify(S.data.site)) {
      changes.push({ type: 'mod', label: 'Site settings', where: 'Site' });
    }
    var beforeCats = {};
    (base.categories || []).forEach(function (c) { beforeCats[c.id] = c; });
    var afterCats = {};
    cats().forEach(function (c) { afterCats[c.id] = c; });
    var sectionDelta = 0;
    cats().forEach(function (c) {
      if (!beforeCats[c.id]) {
        sectionDelta++;
        changes.push({ type: 'add', label: 'Section "' + (c.nav || c.title || c.id) + '"', where: 'Sections' });
      }
    });
    (base.categories || []).forEach(function (c) {
      if (!afterCats[c.id]) {
        sectionDelta++;
        changes.push({ type: 'del', label: 'Section "' + (c.nav || c.title || c.id) + '"', where: 'Sections' });
      }
    });
    if (!sectionDelta && JSON.stringify(base.categories || []) !== JSON.stringify(S.data.categories)) {
      changes.push({ type: 'mod', label: 'Section labels and order', where: 'Sections' });
    }
    return changes;
  }

  function openPublish() {
    var changes = buildDiff();
    var target = S.cfg.owner + '/' + S.cfg.repo + ' @ ' + S.cfg.branch;

    var body = '';
    if (!changes.length) {
      body = '<div class="muted" style="font-size:12.5px">No differences from the version loaded from GitHub. Edit something first, or reload the data.</div>';
    } else {
      body = '<div class="diff-list">' + changes.map(function (change) {
        var mark = change.type === 'add' ? '+' : change.type === 'del' ? '-' : '~';
        return '<div class="diff-row ' + change.type + '"><span class="mark">' + mark + '</span>' +
          '<span>' + esc(change.label) + '</span><span class="where">' + esc(change.where) + '</span></div>';
      }).join('') + '</div>';
      if (S.mode === 'github') {
        body += '<div class="field"><label for="publish-msg">Commit message</label>' +
          '<input class="input" id="publish-msg" value="' + esc('Update site content: ' + changes.length + ' change' + (changes.length === 1 ? '' : 's')) + '"></div>';
      }
    }

    var actions = [];
    if (S.mode === 'github') {
      actions.push({ label: 'Download JSON', kind: 'btn-ghost', spacer: true, onClick: downloadJSON });
      actions.push({ label: 'Cancel', kind: 'btn-ghost', onClick: function () {} });
      actions.push({
        label: 'Publish to GitHub',
        kind: 'btn-primary',
        keepOpen: true,
        disabled: !changes.length,
        onClick: function (btn) { publishToGitHub(btn, changes.length); }
      });
    } else {
      actions.push({ label: 'Close', kind: 'btn-ghost', spacer: true, onClick: function () {} });
      actions.push({ label: 'Copy JSON', kind: 'btn', onClick: copyJSON });
      actions.push({ label: 'Download data.json', kind: 'btn-primary', onClick: downloadJSON });
    }

    openModal({
      title: changes.length ? 'Publish ' + changes.length + ' change' + (changes.length === 1 ? '' : 's') : 'Nothing to publish',
      sub: S.mode === 'github' ? 'Commits data.json to ' + target : 'Offline mode: download the file and replace data.json in the repository',
      body: body,
      actions: actions
    });
  }

  async function publishToGitHub(btn, count) {
    var messageBox = qs('#publish-msg');
    var message = (messageBox && messageBox.value.trim()) || ('Update site content (' + count + ' changes)');
    btn.disabled = true;
    var original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Publishing';
    try {
      var text = JSON.stringify(S.data, null, 2) + '\n';
      var sha = S.sha || await fileExists(DATA_PATH);
      var result = await writeRepoFile(DATA_PATH, text, message, sha);
      S.sha = result.content.sha;
      S.base = clone(S.data);
      S.lastSync = new Date();
      closeModal();
      renderAll();
      loadCommits(true);
      toast('Published to GitHub', 'ok', 'Commit ' + shortSha(result.commit.sha) + ' on ' + S.cfg.branch + '. Pages updates in about a minute.');
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = original;
      var hint = err.status === 409 ? 'Press Reload on the Overview page, re-apply your changes, then publish again.' : '';
      toast('Publish failed', 'err', err.message + (hint ? ' ' + hint : ''));
    }
  }

  function downloadJSON() {
    var blob = new Blob([JSON.stringify(S.data, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'data.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('data.json downloaded', 'ok', 'Replace the file in the repository to publish.');
  }

  function copyJSON() {
    var text = JSON.stringify(S.data, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('JSON copied', 'ok');
      }).catch(function () {
        toast('Clipboard blocked', 'warn', 'Use Download instead.');
      });
    } else {
      toast('Clipboard unavailable', 'warn', 'Use Download instead.');
    }
  }

  /* ----------------------------------------------------------------- images */

  async function uploadImage(file) {
    if (S.mode !== 'github' || !S.connected) {
      throw new Error('Connect a token first. Offline mode cannot upload files to the repository.');
    }
    var allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (allowed.indexOf(file.type) === -1) throw new Error('Use a PNG, JPG, WebP or GIF image.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Keep images under 2 MB so the repository stays fast.');

    var extension = (file.name.split('.').pop() || 'png').toLowerCase();
    var base = slug(file.name.replace(/\.[^.]+$/, '')) || 'image';
    var path = 'assets/' + base + '-' + Date.now().toString(36) + '.' + extension;
    var dataUrl = await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
    var content = String(dataUrl).split(',')[1];
    if (!content) throw new Error('Could not read that file.');

    var sha = await fileExists(path);
    await gh(contentsPath(path), {
      method: 'PUT',
      body: { message: 'Upload ' + path, content: content, branch: S.cfg.branch, sha: sha || undefined }
    });
    return path;
  }

  async function handleImageFile(file) {
    var hint = qs('#f-image-hint');
    hint.textContent = 'Uploading...';
    try {
      var path = await uploadImage(file);
      qs('#f-image').value = path;
      updateImagePreview();
      hint.textContent = 'Uploaded to ' + path;
      toast('Image uploaded', 'ok', path);
    } catch (err) {
      hint.textContent = err.message;
      toast('Upload failed', 'err', err.message);
    }
  }

  /* --------------------------------------------------------------- reload */

  async function reloadFromGitHub() {
    if (S.mode !== 'github') {
      toast('Not connected', 'warn', 'Connect a token on the Connection page.');
      setView('connection');
      return;
    }
    if (isDirty()) {
      var ok = await confirmDialog('Discard local changes?', 'Reloading replaces your draft with the version currently on GitHub.', 'Reload');
      if (!ok) return;
    }
    try {
      await loadFromGitHub();
      S.commits = null;
      renderAll();
      setView('overview');
      toast('Reloaded from ' + S.cfg.branch, 'ok', 'data.json sha ' + shortSha(S.sha));
    } catch (err) {
      toast('Reload failed', 'err', err.message);
    }
  }

  /* --------------------------------------------------------------- events */

  function bindEvents() {
    qs('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      connectFromLogin();
    });
    qs('#toggle-token').addEventListener('click', function () {
      var input = qs('#login-token');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
    qs('#login-offline').addEventListener('click', startOffline);

    qs('#menu-toggle').addEventListener('click', function () {
      qs('#sidebar').classList.toggle('open');
    });

    qsa('.nav-item[data-view]').forEach(function (item) {
      item.addEventListener('click', function () { setView(item.getAttribute('data-view')); });
    });

    qs('#conn-chip').addEventListener('click', function () { setView('connection'); });
    qs('#btn-publish').addEventListener('click', openPublish);
    qs('#btn-reload').addEventListener('click', reloadFromGitHub);
    qs('#btn-new-top').addEventListener('click', function () { openEditor(isCatView(S.cat) ? S.cat : firstCatId()); });
    qs('#btn-add-section').addEventListener('click', addSectionDialog);
    qs('#btn-new').addEventListener('click', function () { openEditor(S.cat); });
    qs('#btn-history-refresh').addEventListener('click', function () {
      S.commits = null;
      renderHistory();
      loadCommits();
    });
    qs('#btn-site-save').addEventListener('click', function () {
      renderAll();
      toast('Site settings updated', 'ok', 'Publish to apply them to the live page.');
    });
    qs('#btn-site-reset').addEventListener('click', function () {
      if (!S.base) return;
      S.data.site = clone(S.base.site);
      S.data.categories = clone(S.base.categories);
      renderSite();
      updateDirtyPill();
      toast('Site settings reverted to the last published values', 'info');
    });

    qs('#content-root').addEventListener('click', onContentClick);
    qs('#content-root').addEventListener('input', function (e) {
      if (e.target.id !== 'content-search') return;
      S.q = e.target.value.trim();
      renderTable();
      updateDirtyPill();
    });
    qs('#content-root').addEventListener('change', function (e) {
      if (e.target.id === 'content-sort') {
        S.sort = e.target.value;
        renderTable();
        return;
      }
      if (e.target.id === 'select-all') {
        var rows = filteredRows();
        S.selection = e.target.checked ? rows.map(function (r) { return r.item.id; }) : [];
        renderTable();
        return;
      }
      if (e.target.hasAttribute('data-select')) {
        var id = e.target.getAttribute('data-select');
        if (e.target.checked) { if (S.selection.indexOf(id) === -1) S.selection.push(id); }
        else S.selection = S.selection.filter(function (x) { return x !== id; });
        renderTable();
      }
    });

    var tableHost = qs('#content-root');
    tableHost.addEventListener('dragstart', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      S.dragId = row.getAttribute('data-id');
      row.style.opacity = '0.4';
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', S.dragId); } catch (err) { /* ignore */ }
      }
    });
    tableHost.addEventListener('dragend', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (row) row.style.opacity = '';
      qsa('tr.drop-target', tableHost).forEach(function (r) { r.classList.remove('drop-target'); });
    });
    tableHost.addEventListener('dragover', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row || !S.dragId) return;
      e.preventDefault();
      qsa('tr.drop-target', tableHost).forEach(function (r) { r.classList.remove('drop-target'); });
      row.classList.add('drop-target');
    });
    tableHost.addEventListener('drop', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      e.preventDefault();
      reorderItem(S.dragId, row.getAttribute('data-id'));
      S.dragId = null;
    });

    qs('#site-root').addEventListener('input', onSiteField);
    qs('#site-root').addEventListener('change', onSiteField);
    qs('#site-root').addEventListener('click', function (e) {
      if (e.target.closest('#btn-site-add-section')) { addSectionDialog(); return; }
      var del = e.target.closest('[data-cat-action="delete"]');
      if (del) { deleteSection(del.getAttribute('data-cat-id')); return; }
      var btn = e.target.closest('[data-order]');
      if (!btn) return;
      moveCategory(btn.getAttribute('data-order'), Number(btn.getAttribute('data-dir')));
    });

    qs('#history-root').addEventListener('click', function (e) {
      var restore = e.target.closest('[data-restore]');
      if (restore) restoreCommit(restore.getAttribute('data-restore'));
      if (e.target.id === 'btn-history-retry') {
        S.commitError = null;
        S.commits = null;
        renderHistory();
        loadCommits();
      }
    });

    qs('#connection-root').addEventListener('click', onConnectionClick);
    qs('#connection-root').addEventListener('change', function (e) {
      if (e.target.id === 'c-token-toggle') return;
      readConnectionForm();
      updateDirtyPill();
    });

    document.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) setView(go.getAttribute('data-go'));
    });

    /* drawer */
    qs('#drawer-close').addEventListener('click', closeEditor);
    qs('#drawer-cancel').addEventListener('click', closeEditor);
    qs('#overlay').addEventListener('click', closeEditor);
    qs('#drawer-save').addEventListener('click', saveEditor);
    qs('#drawer-delete').addEventListener('click', function () {
      var id = S.draft && S.draft.id;
      if (id) deleteItemById(S.draftCat, id);
    });
    qs('#f-price-mode').addEventListener('change', updatePriceVisibility);
    qs('#f-image').addEventListener('input', updateImagePreview);
    qs('#f-image-upload').addEventListener('click', function () { qs('#file-image').click(); });
    qs('#file-image').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handleImageFile(file);
      e.target.value = '';
    });
    qs('#emoji-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-emoji]');
      if (!btn) return;
      qs('#f-icon').value = btn.getAttribute('data-emoji');
      qsa('#emoji-grid button').forEach(function (b) { b.classList.remove('picked'); });
      btn.classList.add('picked');
    });
    bindChipField('f-features', 'features');
    bindChipField('f-tags', 'tags');

    /* modal */
    qs('#modal').addEventListener('click', function (e) {
      if (e.target === qs('#modal')) closeModal();
    });

    qs('#file-import').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      importDataFile(file);
      e.target.value = '';
    });

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', function (e) {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
  }

  function onContentClick(e) {
    var bulkBtn = e.target.closest('[data-bulk]');
    if (bulkBtn) {
      bulkAction(bulkBtn.getAttribute('data-bulk'));
      return;
    }
    var filterBtn = e.target.closest('[data-filter]');
    if (filterBtn) {
      S.filter = filterBtn.getAttribute('data-filter');
      qsa('#content-seg button').forEach(function (b) { b.classList.toggle('active', b === filterBtn); });
      renderTable();
      return;
    }
    var actionBtn = e.target.closest('[data-act]');
    if (actionBtn) {
      var id = actionBtn.getAttribute('data-id');
      var action = actionBtn.getAttribute('data-act');
      if (action === 'edit') openEditor(S.cat, id);
      if (action === 'copy') duplicateItem(id);
      if (action === 'del') deleteItemById(S.cat, id);
      if (action === 'up') moveItem(id, -1);
      if (action === 'down') moveItem(id, 1);
      return;
    }
    var newBtn = e.target.closest('[data-new]');
    if (newBtn) { openEditor(newBtn.getAttribute('data-new')); return; }
    if (e.target.closest('[data-clear]')) {
      S.q = '';
      S.filter = 'all';
      renderContent();
      return;
    }
  }

  function bulkAction(action) {
    var ids = S.selection.slice();
    if (!ids.length) return;
    if (action === 'delete') {
      confirmDialog('Delete ' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + '?',
        'They are removed from your draft. The live site changes when you publish.', 'Delete', true).then(function (ok) {
        if (!ok) return;
        S.data[S.cat] = items(S.cat).filter(function (item) { return ids.indexOf(item.id) === -1; });
        S.selection = [];
        renderAll();
        toast('Deleted ' + ids.length + ' item' + (ids.length === 1 ? '' : 's'), 'ok');
      });
      return;
    }
    items(S.cat).forEach(function (item) {
      if (ids.indexOf(item.id) === -1) return;
      if (action === 'feature') item.featured = true;
      if (action === 'unfeature') item.featured = false;
      if (action === 'hide') item.hidden = true;
      if (action === 'show') item.hidden = false;
      item.updated = todayISO();
    });
    S.selection = [];
    renderAll();
    toast('Updated ' + ids.length + ' item' + (ids.length === 1 ? '' : 's'), 'ok');
  }

  function moveCategory(catId, direction) {
    var list = cats();
    var index = list.findIndex(function (c) { return c.id === catId; });
    var target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    var swapped = list[index];
    list[index] = list[target];
    list[target] = swapped;
    list.forEach(function (cat, i) { cat.order = i + 1; });
    renderSite();
    renderContentNav();
    updateDirtyPill();
  }

  function sectionId(name) {
    var base = slug(name) || 'section';
    var taken = {};
    cats().forEach(function (c) { taken[c.id] = true; });
    var id = base, n = 2;
    while (taken[id]) { id = base + '-' + n; n++; }
    return id;
  }

  function addSectionDialog() {
    openModal({
      title: 'Add a section',
      sub: 'A section becomes a nav link and a heading on the public site. Rename or reorder it later from Site settings.',
      body:
        '<div class="field"><label for="new-cat-name">Section name</label>' +
          '<input class="input" id="new-cat-name" placeholder="e.g. Arenas" maxlength="40" autocomplete="off">' +
        '</div>' +
        '<div class="field" style="margin-top:12px"><label for="new-cat-title">Heading on the page</label>' +
          '<input class="input" id="new-cat-title" placeholder="Leave empty to reuse the name" maxlength="60"></div>' +
        '<div class="field" style="margin-top:12px"><label for="new-cat-blurb">Short description</label>' +
          '<input class="input" id="new-cat-blurb" placeholder="One line shown under the heading" maxlength="140"></div>' +
        '<div class="hint" id="new-cat-id-note" style="margin-top:12px"></div>',
      actions: [
        { label: 'Cancel', kind: 'btn-ghost', spacer: true },
        { label: 'Add section', kind: 'btn-primary', keepOpen: true, onClick: submitNewSection }
      ]
    });

    var nameEl = qs('#new-cat-name');
    var note = qs('#new-cat-id-note');
    function syncNote() {
      var value = nameEl.value.trim();
      note.textContent = value ? 'Link anchor on the site: #' + sectionId(value) : 'The name also becomes the #anchor of the section.';
    }
    nameEl.addEventListener('input', syncNote);
    nameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitNewSection(); }
    });
    syncNote();
    setTimeout(function () { nameEl.focus(); }, 60);
  }

  function submitNewSection() {
    var nameEl = qs('#new-cat-name');
    var name = (nameEl.value || '').trim();
    if (!name) {
      nameEl.classList.add('invalid');
      nameEl.focus();
      toast('Give the section a name first', 'warn');
      return;
    }
    var id = sectionId(name);
    var heading = (qs('#new-cat-title').value || '').trim() || name;
    var blurb = (qs('#new-cat-blurb').value || '').trim();
    S.data.categories.push({ id: id, nav: name, title: heading, blurb: blurb, order: cats().length + 1 });
    if (!Array.isArray(S.data[id])) S.data[id] = [];
    closeModal();
    renderContentNav();
    if (S.view === 'site') renderAll();
    else setView(id);
    toast('Section created', 'ok', '"' + name + '" is a draft until you publish.');
  }

  function deleteSection(catId) {
    var cat = catById(catId);
    if (!cat) return;
    if (cats().length <= 1) {
      toast('Keep at least one section', 'warn', 'The site needs somewhere to show items.');
      return;
    }
    var count = items(catId).length;
    var label = cat.nav || cat.title || cat.id;
    confirmDialog(
      'Delete the "' + label + '" section?',
      count
        ? count + ' item' + (count === 1 ? '' : 's') + ' inside it will be deleted too. Move them to another section first if you want to keep them.'
        : 'It is empty, so nothing else is removed.',
      'Delete section',
      true
    ).then(function (ok) { if (ok) removeSection(catId); });
  }

  function removeSection(catId) {
    var cat = catById(catId);
    var label = cat ? (cat.nav || cat.title || cat.id) : catId;
    S.data.categories = cats().filter(function (c) { return c.id !== catId; });
    S.data.categories.forEach(function (c, i) { c.order = i + 1; });
    delete S.data[catId];
    if (S.cat === catId) S.cat = firstCatId();
    if (S.view === catId) S.view = 'site';
    S.selection = [];
    renderAll();
    toast('Section "' + label + '" deleted', 'ok', 'Publish to remove it from the live site.');
  }

  var saveSiteField = debounce(function () { updateDirtyPill(); }, 120);

  function onSiteField(e) {
    var field = e.target.getAttribute('data-field');
    var catId = e.target.getAttribute('data-cat');
    var catField = e.target.getAttribute('data-catfield');

    if (field) {
      var value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setPath(S.data, field, value);
      saveSiteField();
      return;
    }
    if (catId && catField) {
      var cat = catById(catId);
      if (!cat) return;
      cat[catField] = e.target.value;
      if (catField === 'nav') renderContentNav();
      if (catField === 'title' && S.view === catId) renderContent();
      saveSiteField();
    }
  }

  function readConnectionForm() {
    var owner = qs('#c-owner');
    if (!owner) return;
    S.cfg.owner = owner.value.trim();
    S.cfg.repo = qs('#c-repo').value.trim();
    S.cfg.branch = qs('#c-branch').value.trim() || 'main';
    S.cfg.token = qs('#c-token').value.trim();
    S.cfg.remember = true;
  }

  async function onConnectionClick(e) {
    var btn = e.target.closest('[data-conn]');
    if (e.target.id === 'c-token-toggle') {
      var input = qs('#c-token');
      input.type = input.type === 'password' ? 'text' : 'password';
      return;
    }
    if (!btn) return;
    var action = btn.getAttribute('data-conn');

    if (action === 'save' || action === 'test') {
      readConnectionForm();
      saveCfg();
      btn.disabled = true;
      var original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Testing';
      try {
        await runDiagnostics();
        S.lastDiag = Date.now();
        var failed = S.checks.filter(function (c) { return c.critical && c.status !== 'ok'; });
        if (failed.length) {
          toast('Connection problem', 'err', failed[0].detail);
        } else {
          toast('Connection healthy', 'ok', 'Token can read and write ' + S.cfg.repo + '.');
          if (S.mode !== 'github') {
            await loadFromGitHub();
            enterApp();
          }
        }
      } catch (err) {
        toast('Connection failed', 'err', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        renderConnection();
        renderStatusChip();
      }
      return;
    }

    if (action === 'reload') { reloadFromGitHub(); return; }

    if (action === 'forget') {
      var ok = await confirmDialog('Forget the saved token?', 'The token is deleted from this browser. The repository is untouched.', 'Forget token', true);
      if (!ok) return;
      S.cfg.token = '';
      forgetCfg();
      S.mode = 'offline';
      S.connected = false;
      S.checks = [];
      renderConnection();
      renderStatusChip();
      toast('Token removed from this browser', 'ok');
      return;
    }

    if (action === 'import') { qs('#file-import').click(); return; }
    if (action === 'download') { downloadJSON(); return; }
    if (action === 'copy') { copyJSON(); return; }
  }

  async function importDataFile(file) {
    try {
      var text = await file.text();
      var parsed = JSON.parse(text);
      S.data = normalize(parsed);
      S.base = clone(S.data);
      S.sha = null;
      S.selection = [];
      if (qs('#app').hidden) enterApp(); else renderAll();
      setView('overview');
      toast('Imported ' + file.name, 'ok', 'This replaced the current draft in the browser.');
    } catch (err) {
      toast('Import failed', 'err', 'That file is not valid JSON: ' + err.message);
    }
  }

  function bindChipField(containerId, field) {
    var container = qs('#' + containerId);
    var input = container.querySelector('input');

    function add(value) {
      if (!S.draft) return;
      var text = String(value || '').trim();
      if (!text) return;
      if ((S.draft[field] || []).indexOf(text) === -1) {
        S.draft[field] = (S.draft[field] || []).concat([text]);
        renderChips(containerId, field);
      }
      input.value = '';
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        add(input.value);
      }
      if (e.key === 'Backspace' && !input.value && (S.draft[field] || []).length) {
        S.draft[field] = S.draft[field].slice(0, -1);
        renderChips(containerId, field);
      }
    });
    input.addEventListener('blur', function () { add(input.value); });
    container.addEventListener('click', function (e) {
      var remove = e.target.closest('[data-chip-remove]');
      if (!remove) return;
      var index = Number(remove.getAttribute('data-chip-remove'));
      S.draft[field] = S.draft[field].filter(function (_, i) { return i !== index; });
      renderChips(containerId, field);
    });
  }

  function onKeyDown(e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!qs('#app').hidden) openPublish();
      return;
    }
    if (e.key === 'Escape') {
      if (qs('#modal').classList.contains('show')) { closeModal(); return; }
      if (qs('#drawer').classList.contains('open')) { closeEditor(); return; }
      if (qs('#sidebar').classList.contains('open')) { qs('#sidebar').classList.remove('open'); return; }
      return;
    }
    if (typing) return;
    if ((e.key === 'n' || e.key === 'N') && !qs('#app').hidden) {
      e.preventDefault();
      openEditor(S.cat);
      return;
    }
    if (e.key === '/' && !qs('#app').hidden) {
      e.preventDefault();
      if (!isCatView(S.view)) setView(isCatView(S.cat) ? S.cat : firstCatId());
      var search = qs('#content-search');
      if (search) search.focus();
    }
  }

  /* ------------------------------------------------------------------ init */

  async function init() {
    loadCfg();
    fillLoginForm();
    renderEmojiGrid();
    bindEvents();
    updateDirtyPill();

    if (S.cfg.token) {
      showLogin('Restoring your session...');
      try {
        await runDiagnostics();
        var failed = S.checks.filter(function (c) { return c.critical && c.status !== 'ok'; });
        if (failed.length) throw new Error(failed[0].detail);
        await loadFromGitHub();
        S.lastDiag = Date.now();
        enterApp();
        loadCommits(true);
      } catch (err) {
        showLogin(err.message);
      }
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();




