/* CareTeam 前端（原生 JS；不拼接 HTML，所有文字以 textContent 輸出） */
(function () {
  'use strict';
  var CFG = window.CARETEAM_CONFIG || {};
  var S = { session: '', me: null, info: null, b: null, draft: null, handout: null, dash: null };

  /* ---------- DOM 工具 ---------- */
  function h(tag, attrs) {
    var el = document.createElementNS(/^(svg|path|rect|line|circle|text|g|polyline|title)$/.test(tag) ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); });
      else if (k === 'cls') el.setAttribute('class', v);
      else if (k === 'style') Object.keys(v).forEach(function (p) { el.style[p] = v[p]; });
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }
  function $(id) { return document.getElementById(id); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function toast(msg) { var t = h('div', { cls: 'toast', role: 'status', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500); }
  function uid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function seg(options, value, onPick, cls, label) {
    var w = h('div', { cls: 'seg ' + (cls || ''), role: 'group', 'aria-label': label || '' });
    options.forEach(function (o) {
      var v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
      w.appendChild(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(value === v || (Array.isArray(value) && value.indexOf(v) >= 0)), text: t, on: { click: function () { onPick(v); } } }));
    });
    return w;
  }
  function ladder(L, target, teach) {
    var bars = h('span', { cls: 'ladder', 'aria-hidden': 'true' });
    // V13：層級以文字標示，不只靠顏色
    var w = h('span', { cls: 'ladder-wrap' }, bars, h('span', { cls: 'ladder-t', text: '現在「' + (LV[L] || L) + '」' + (target ? '，目標「' + (LV[target] || target) + '」' : '') }));
    for (var i = 0; i < 4; i++) {
      var c = i <= L && i > 0 ? 'on' : ''; if (i === 0 && L >= 0) c = 'on';
      if (teach && i === teach) c = 'teach';
      if (target && i === target) c += ' target';
      bars.appendChild(h('i', { cls: c }));
    }
    return w;
  }
  var LV = ['未知', '知道', '會做', '持續做到'];

  /* ---------- API ---------- */
  var busy = false;
  function api(action, payload, opt) {
    opt = opt || {};
    var body = { action: action, payload: payload || {}, session: S.session, clientVersion: CFG.clientVersion || '1.0.0' };
    if (opt.idemKey) body.idemKey = opt.idemKey;
    return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { $('offline').hidden = true; return r.json(); })
      .catch(function () { $('offline').hidden = false; throw { code: 'NETWORK', message: '網路連線失敗，資料仍在這個分頁，請按重送' }; })
      .then(function (r) {
        if (r.ok) return r.data;
        var e = r.error || { code: 'SERVER_ERROR', message: '未知錯誤' };
        if (e.code === 'BUSY' && (opt.retry || 0) < 3) return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return api(action, payload, Object.assign({}, opt, { retry: (opt.retry || 0) + 1 })); });
        if (e.code === 'UNAUTHENTICATED' && action !== 'login') { S.session = ''; dropAllDrafts(); showLogin(e.message); }
        if (e.code === 'VERSION_MISMATCH') { clear($('app')).appendChild(h('div', { cls: 'alert high', text: e.message })); }
        if (e.code === 'READONLY') { if (S.me) S.me.readonly = e.message; roBanner(); }
        throw e;
      });
  }
  function fail(e, where) { var m = (e && e.message) || String(e); toast(m); if (where) { clear(where).appendChild(h('p', { cls: 'err', role: 'alert', text: m })); } }

  /* ---------- 登入 ---------- */
  function showLogin(msg) {
    var app = clear($('app'));
    $('nav').hidden = true; $('who').hidden = true;
    app.appendChild(h('section', { style: { maxWidth: '520px' } },
      h('h1', { text: '登入 CareTeam' }),
      h('p', { cls: 'lede', text: '使用醫院授權名單中的 Google 帳號登入。未在名單內請洽您的職類管理員。' }),
      msg ? h('p', { cls: 'err', role: 'alert', text: msg }) : null,
      h('div', { id: 'gsi' }),
      CFG.devTokens ? devLogin() : null,
      S.draft ? h('p', { cls: 'alert mid', text: '未送出的紀錄仍保留在這個分頁，登入後會回到原畫面。' }) : null));
    if (!CFG.devTokens && window.google && google.accounts) initGsi();
    else if (!CFG.devTokens) loadGsi();
  }
  function loadGsi() {
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = initGsi;
    s.onerror = function () { var g = $('gsi'); if (g) g.appendChild(h('p', { cls: 'err', text: '無法載入 Google 登入，請確認網路。' })); };
    document.head.appendChild(s);
  }
  function initGsi() {
    google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: function (r) { doLogin(r.credential); } });
    google.accounts.id.renderButton($('gsi'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'zh-TW' });
  }
  /** 僅本機驗收伺服器提供 devTokens；正式 config.js 不含此欄 */
  function devLogin() {
    var sel = h('select', { 'aria-label': '測試帳號' }, Object.keys(CFG.devTokens).map(function (e) { return h('option', { value: e, text: e }); }));
    return h('div', { cls: 'panel', style: { marginTop: '16px' } }, h('p', { cls: 'muted', text: '本機驗收模式（正式部署不會出現）' }), sel, h('button', { cls: 'btn', type: 'button', style: { marginTop: '8px' }, text: '以測試帳號登入', on: { click: function () { doLogin(CFG.devTokens[sel.value]); } } }));
  }
  function doLogin(tok) {
    api('login', { idToken: tok }).then(function (d) { S.session = d.session; return api('whoami'); }).then(function (w) { S.info = w; S.me = w.me; sweepDrafts(); chrome(); route(); }).catch(function (e) { showLogin(e.message); });
  }

  /* ---------- 外框 ---------- */
  function chrome() {
    var me = S.me;
    $('hosp').textContent = S.info.hospital || CFG.hospitalName || '';
    var nav = clear($('nav')); nav.hidden = false;
    var items = [['#/', '今日'], ['#/notes', '本班病歷'], ['#/groups', '群組'], ['#/cal', '行事曆'], ['#/dash', '成效'], ['#/me', '我的']];
    if (me.novice || true) items.push(['#/teach', '教學']);
    if (me.permission !== 'L1') items.push(['#/roster', '名單']);
    if (me.permission === 'L3') items.push(['#/admin', '系統']);
    if (me.sign_scope && me.sign_scope.length) items.push(['#/sign', '簽核確認']);
    items.forEach(function (x) { nav.appendChild(h('a', { href: x[0] }, x[1], h('span', { cls: 'badge', 'data-badge': x[0], hidden: true }))); });
    startPoll();
    var who = clear($('who')); who.hidden = false;
    var roles = me.tester ? S.info.roles.map(function (r) { return r.id; }) : me.roles;
    var sel = h('select', { 'aria-label': '目前職類', on: { change: function () { api('switchRole', { role: sel.value }).then(function (d) { S.session = d.session; S.me = d.me; chrome(); route(); }).catch(fail); } } },
      roles.map(function (r) { var nm = (S.info.roles.filter(function (x) { return x.id === r; })[0] || {}).name || r; return h('option', { value: r, selected: r === me.acting_role, text: nm }); }));
    who.appendChild(h('span', { text: me.name }));
    who.appendChild(h('button', { cls: 'btn quiet', type: 'button', id: 'logout', text: '登出', on: { click: function () { dropAllDrafts(); S.session = ''; S.me = null; S.b = null; S.draft = null; showLogin('已登出。'); } } }));
    if (roles.length > 1) who.appendChild(sel); else who.appendChild(h('span', { cls: 'chip', text: me.acting_role_name }));
    roBanner();
    var tb = $('testbar');
    tb.hidden = !(me.test_mode || me.mode !== '正式');
    tb.textContent = me.test_mode ? '測試身分：扮演' + me.acting_role_name + '。只能開啟 TEST 開頭的演練病歷號，資料不進任何指標。' : '演練模式：只接受 TEST 開頭的演練病歷號。';
    document.body.classList.remove('large');
  }
  /** 唯讀橫幅（8.6 fail-closed）：稽核鏈不一致或管理者設定時，所有寫入停止，畫面持續標示 */
  function roBanner() {
    var b = $('robanner'); if (!b) { b = h('div', { id: 'robanner', cls: 'robanner', role: 'alert' }); document.querySelector('.top').appendChild(b); }
    var r = S.me && S.me.readonly; b.hidden = !r; document.body.classList.toggle('ro', !!r);
    roLock();
    b.textContent = r ? '系統唯讀中：可以看今日名單、儀表板與我的數字；不能開啟病人、建檔或送出。請通知系統管理者。' : '';
  }
  /** N06：唯讀時真正停用寫入按鈕（disabled＋aria-disabled，鍵盤也無法觸發）；只讀按鈕以 data-read 標記保留 */
  var roObs = null;
  function roLock() {
    var on = !!(S.me && S.me.readonly);
    var apply = function () { if (!document.body.classList.contains('ro')) return; Array.prototype.forEach.call(document.querySelectorAll('#app button.btn:not([data-read]), #bar button.btn:not([data-read])'), function (x) { if (!x.disabled) { x.disabled = true; x.setAttribute('aria-disabled', 'true'); x.title = '系統唯讀中，暫停寫入'; } }); };
    if (on && !roObs && window.MutationObserver) { roObs = new MutationObserver(apply); ['app', 'bar'].forEach(function (id) { if ($(id)) roObs.observe($(id), { childList: true, subtree: true }); }); }
    if (!on && roObs) { roObs.disconnect(); roObs = null; }
    apply();
  }
  function navMark() { var cur = location.hash.split('/').slice(0, 2).join('/') || '#/'; Array.prototype.forEach.call($('nav').querySelectorAll('a'), function (a) { if (a.getAttribute('href') === cur || (cur === '#' && a.getAttribute('href') === '#/')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }
  /** 底部操作列；頁面底部留出操作列高度，避免最後的內容被蓋住（窄螢幕操作列可能多行） */
  function setBar(node) {
    var b = clear($('bar')); if (node) b.appendChild(h('div', { cls: 'actionbar noprint' }, h('div', { cls: 'in' }, node)));
    var pad = function () { var a = b.firstChild; document.body.style.paddingBottom = a ? (a.offsetHeight + 16) + 'px' : ''; };
    pad(); if (window.requestAnimationFrame) requestAnimationFrame(pad);
  }
  window.addEventListener('resize', function () { var a = $('bar') && $('bar').firstChild; document.body.style.paddingBottom = a ? (a.offsetHeight + 16) + 'px' : ''; });

  /* ---------- 路由 ---------- */
  function route() {
    if (!S.session) return showLogin();
    var p = (location.hash || '#/').slice(2).split('/');
    navMark(); setBar(null);
    var pqs = $('pqsheet'); if (pqs) pqs.remove(); document.body.classList.remove('pq-open');
    if (p[0] !== 'p') { S.pview = null; document.body.classList.remove('pview'); }
    var app = clear($('app')); app.focus();
    if (S.draft && p[0] !== 'p' && p[0] !== 'handout') { /* 保留草稿 */ }
    switch (p[0]) {
      case '': return home(app);
      case 'prep': return prep(app, p[1]);
      case 'p': return patient(app, p[1]);
      case 'handout': return handoutPage(app);
      case 'wallet': return wallet(app, p[1]);
      case 'dash': return dashboard(app);
      case 'me': return mine(app);
      case 'teach': return teaching(app);
      case 'roster': return roster(app);
      case 'admin': return admin(app);
      case 'sign': return signPage(app);
      case 'notes': return notesPage(app);
      case 'groups': return groupsPage(app, p[1] ? decodeURIComponent(p[1]) : '');
      case 'cal': return calendarPage(app);
      case 'report': return reportPage(app);
      default: location.hash = '#/';
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) { if (S.draft && S.draft.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- 今日 ---------- */
  function home(app) {
    app.appendChild(h('h1', { text: '今日名單' }));
    app.appendChild(h('p', { cls: 'lede', text: '貼上病歷號與出生年（每行一位），先在電腦前備診，到床邊再開啟。' }));
    var grid = h('div', { cls: 'grid2' }); app.appendChild(grid);
    var left = h('div'), right = h('aside');
    grid.appendChild(left); grid.appendChild(right);
    var ta = h('textarea', { id: 'paste', 'aria-describedby': 'paste-hint', placeholder: 'TEST0001 1950\nTEST0002 1962' });
    var out = h('div');
    left.appendChild(h('div', { cls: 'field' }, h('label', { for: 'paste', text: '加入今日名單' }), ta, h('div', { id: 'paste-hint', cls: 'hint', text: '格式：病歷號 空格 西元出生年。名單只有您自己看得到。' })));
    left.appendChild(h('div', { cls: 'inline' }, h('button', { cls: 'btn', type: 'button', text: '加入名單', on: { click: function () { api('addToToday', { text: ta.value }).then(function (d) { ta.value = ''; renderList(d); if (d.notFound.length || d.errors.length) out.appendChild(addResult(d)); }).catch(function (e) { fail(e, out); }); } } }),
      h('button', { cls: 'btn ghost', type: 'button', text: '新病人建檔', on: { click: function () { createForm(left); } } })));
    left.appendChild(out);
    var listBox = h('div'); left.appendChild(listBox);
    var openBox = h('div', { cls: 'panel' }); right.appendChild(openBox);
    var mrn = h('input', { type: 'text', id: 'omrn', autocomplete: 'off' }), by = h('input', { type: 'text', id: 'oby', inputmode: 'numeric', maxlength: '4' });
    var setting = 'select';
    // 預設「不改變場域」：直接開啟不會另開照護段落（R-10）
    var sSel = h('select', { id: 'oset' }, [h('option', { value: '', text: '沿用目前場域' })].concat(S.info.enums.SETTING.map(function (s) { return h('option', { value: s, text: s }); })));
    openBox.appendChild(h('h3', { text: '直接開啟病人' }));
    openBox.appendChild(h('div', { cls: 'field' }, h('label', { for: 'omrn', text: '病歷號' }), mrn));
    openBox.appendChild(h('div', { cls: 'field' }, h('label', { for: 'oby', text: '出生年（西元）' }), by));
    openBox.appendChild(h('div', { cls: 'field' }, h('label', { for: 'oset', text: '場域' }), sSel));
    openBox.appendChild(h('button', { cls: 'btn', type: 'button', text: '開啟', on: { click: function () { openByMrn(mrn.value, by.value, sSel.value, openBox); } } }));
    var taskBox = h('div', { cls: 'panel' }); right.appendChild(taskBox);
    var inboxBox = h('div', { cls: 'panel' }); right.appendChild(inboxBox);
    api('msg.inbox', {}).then(function (d) { S.inbox = d; inboxPanel(inboxBox, d); }).catch(function () {});
    function renderList(d) {
      clear(listBox);
      listBox.appendChild(h('h2', { text: '今天（' + d.date + '）' }));
      if (!d.patients.length) listBox.appendChild(h('p', { cls: 'muted', text: '名單是空的。貼上病歷號與出生年後按「加入名單」。' }));
      var ul = h('ul', { cls: 'list' });
      // D48 M13 巡房：勾選多位後連續完成，最後到本班病歷逐床複製
      var pick = {};
      var roundBtn = h('button', { cls: 'btn', type: 'button', text: '開始巡房', disabled: true, on: { click: function () { var ids = d.patients.filter(function (p) { return pick[p.person_id]; }).map(function (p) { return { pid: p.person_id, title: p.title || '', tail: p.tail }; }); S.round = { list: ids, i: 0 }; S.b = null; S.draft = null; location.hash = '#/p/' + ids[0].pid; } } });
      var syncRound = function () { var n = Object.keys(pick).filter(function (k) { return pick[k]; }).length; roundBtn.disabled = !n; roundBtn.textContent = n ? '開始巡房（' + n + ' 位）' : '開始巡房'; };
      if (d.patients.length) listBox.appendChild(h('div', { cls: 'inline round-bar' }, roundBtn, h('a', { cls: 'btn ghost', href: '#/notes', text: '本班病歷' + (d.notes_unpasted ? '（' + d.notes_unpasted + ' 位未貼）' : '') }), h('span', { cls: 'hint', text: '勾選要巡的病人，依序完成後到本班病歷逐床複製。' })));
      d.patients.forEach(function (p) {
        ul.appendChild(h('li', null,
          h('label', { cls: 'round-pick' }, h('input', { type: 'checkbox', 'aria-label': '加入巡房：' + (p.title || '未填稱謂') + ' ' + p.tail, on: { change: function (e) { pick[p.person_id] = e.target.checked; syncRound(); } } })),
          h('div', { cls: 'main' }, h('div', { cls: 't', text: (p.bed ? p.bed + '床　' : '') + (p.title || '未填稱謂') + '　' + p.tail }), h('div', { cls: 'chips' }, p.diseases.map(function (x) { return h('span', { cls: 'chip', text: dzName(x) }); }), p.in_scope ? null : h('span', { cls: 'chip warn', text: '非我的專責範圍' }))),
          p.unread ? h('span', { cls: 'chip warn', text: '留言 ' + p.unread }) : null,
          p.pq_tell ? h('span', { cls: 'chip new', text: '待告知病人 ' + p.pq_tell }) : null,
          h('span', { cls: 'chip ' + (p.status === '已完成' ? 'ok' : p.status === '已備診' ? 'new' : ''), text: p.status }),
          h('a', { cls: 'btn quiet', href: '#/prep/' + p.person_id, text: '備診' }),
          h('a', { cls: 'btn', href: '#/p/' + p.person_id, text: '床邊' })));
      });
      listBox.appendChild(ul);
      if (d.appts && (d.appts.today.length || d.appts.tomorrow.length)) listBox.appendChild(h('div', { cls: 'panel appt-today' }, h('h3', { text: '照護預定' }),
        d.appts.today.length ? h('ul', { cls: 'list' }, d.appts.today.map(function (a) { return h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: '今天' + a.slot + (a.time ? ' ' + a.time : '') + '　' + (a.title || '未填稱謂') + '　' + a.tail }), h('div', { cls: 'muted', text: a.type + (a.place ? '｜' + a.place : '') + '｜由' + a.by_role + '建立' }))); })) : null,
        d.appts.tomorrow.length ? h('p', { cls: 'muted', text: '明天 ' + d.appts.tomorrow.length + ' 位預定：' + d.appts.tomorrow.map(function (a) { return (a.title || '') + a.tail; }).join('、') + '（可先備診）' }) : null,
        h('p', { cls: 'hint', text: '仍須以病歷號＋出生年加入名單才能開啟。' })));
      clear(taskBox).appendChild(h('h3', { text: '交給我與待處理' }));
      if (!d.tasks.length) taskBox.appendChild(h('p', { cls: 'muted', text: '目前沒有交班、轉介或待裁決。' }));
      var tl = h('ul', { cls: 'list' });
      d.tasks.forEach(function (t) {
        tl.appendChild(h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: t.type + '：' + (t.title || '') + ' ' + t.tail }), h('div', { cls: 'muted', text: (t.mine_out ? '我交出 → ' + t.to_role_name : '來自' + t.from) + (t.reason ? '｜' + t.reason : '') + '｜' + t.status })),
          taskActions(t)));
      });
      taskBox.appendChild(tl);
    }
    api('todayList', {}).then(renderList).catch(function (e) { fail(e, listBox); });
  }
  /** D49 收件匣：要我回的、我發出還沒回的、知會、群組 */
  function inboxPanel(box, d) {
    clear(box).appendChild(h('h3', { text: '收件匣' }));
    var tab = S.inboxTab || 'need_reply';
    var tabs = [['need_reply', '要我回的', d.need_reply.length], ['mine_open', '我發出還沒回的', d.mine_open.length], ['fyi', '知會', d.fyi.length], ['groups', '群組', d.groups_unread]];
    box.appendChild(h('div', { cls: 'tabs', role: 'tablist' }, tabs.map(function (t) { return h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === t[0]), text: t[1] + (t[2] ? '（' + t[2] + '）' : ''), on: { click: function () { S.inboxTab = t[0]; inboxPanel(box, d); } } }); })));
    if (tab === 'groups') { var gs = d.groups.filter(function (g) { return g.joined; }); box.appendChild(gs.length ? h('ul', { cls: 'list' }, gs.map(function (g) { return h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: g.name + '（' + g.kind + '）' }), h('div', { cls: 'muted', text: g.last ? g.last.from + '：' + g.last.text : '尚無訊息' })), g.unread ? h('span', { cls: 'chip warn', text: '未讀 ' + g.unread }) : null, h('a', { cls: 'btn quiet', href: '#/groups/' + encodeURIComponent(g.id), text: '開啟' })); })) : h('p', { cls: 'muted', text: '尚未加入群組。' })); return; }
    var arr = d[tab];
    if (!arr.length) { box.appendChild(h('p', { cls: 'muted', text: '沒有留言。' })); return; }
    box.appendChild(h('ul', { cls: 'list' }, arr.slice().reverse().map(function (m) { return h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: (m.title || '') + ' ' + (m.tail || '') + '｜' + m.type }), h('div', { cls: 'muted', text: m.from + (m.to ? ' → ' + m.to : '') + '：' + m.text })), h('a', { cls: 'btn quiet', href: '#/p/' + m.person_id, text: '開啟' })); })));
  }
  /* ---------- 13.12 群組（依職類、依疾病） ---------- */
  function groupsPage(app, gid) {
    app.appendChild(h('h1', { text: '群組' }));
    app.appendChild(h('p', { cls: 'lede', text: '職類群組依名單職類；疾病群組依照護範圍。群組不談個別病人：不要寫姓名、病歷號、電話或日期；要談病人請到該病人的對話串。' }));
    var grid = h('div', { cls: 'grid2 groups' + (gid ? ' has-sel' : '') }); app.appendChild(grid);
    var left = h('div', { cls: 'glist' }), right = h('div', { cls: 'gmain' }); grid.appendChild(left); grid.appendChild(right);
    api('group.list', {}).then(function (d) {
      // VR11-17：已加入的群組直接列；可加入的群組收合（目前開啟者在其中時展開）
      var gli = function (g) { return h('li', { cls: g.id === gid ? 'sel' : '' }, h('a', { cls: 'main glink', href: '#/groups/' + encodeURIComponent(g.id) }, h('div', { cls: 't', text: g.name }), h('div', { cls: 'muted', text: g.last ? g.last.text : (g.joined ? '尚無訊息' : '未加入') })), g.unread && g.joined ? h('span', { cls: 'chip warn', text: '未讀 ' + g.unread }) : null); };
      var sec = function (kind) {
        var gs = d.groups.filter(function (g) { return g.kind === kind; }); if (!gs.length) return null;
        var j = gs.filter(function (g) { return g.joined; }), o = gs.filter(function (g) { return !g.joined; });
        var more = o.length ? h('details', { cls: 'gmore' }, h('summary', { text: '可加入的' + kind + '群組（' + o.length + '）' }), h('p', { cls: 'hint', text: '點群組名稱進入後可加入。' }), h('ul', { cls: 'list' }, o.map(gli))) : null;
        if (more && o.some(function (g) { return g.id === gid; })) more.open = true;
        return h('section', null, h('h2', { text: kind + '群組' }), j.length ? h('ul', { cls: 'list' }, j.map(gli)) : h('p', { cls: 'muted', text: '尚未加入' + kind + '群組。' }), more);
      };
      left.appendChild(sec('職類')); left.appendChild(sec('疾病'));
    }).catch(function (e) { fail(e, left); });
    if (!gid) { right.appendChild(h('p', { cls: 'muted', text: '選一個群組。' })); return; }
    var v = { type: '知會', text: '', pin: false };
    var draw = function (d) {
      clear(right);
      right.appendChild(h('div', { cls: 'inline' }, h('a', { cls: 'btn quiet back', href: '#/groups', text: '群組清單' }), h('h2', { text: d.group.name + '（' + d.group.kind + '，' + d.group.member_n + ' 人）' }),
        d.group.kind === '疾病' ? h('button', { cls: 'btn quiet', type: 'button', text: d.group.joined ? '退出收件匣' : '加入收件匣', on: { click: function () { api(d.group.joined ? 'group.leave' : 'group.join', { groupId: gid }).then(function () { route(); }).catch(fail); } } }) : null));
      if (d.pinned.length) right.appendChild(h('div', { cls: 'alert info pinned' }, d.pinned.map(function (m) { return h('div', null, h('b', { text: '置頂公告：' }), m.text); })));
      var list = h('div', { cls: 'tl', role: 'log', 'aria-label': '群組訊息' });
      if (!d.msgs.length) list.appendChild(h('p', { cls: 'muted', text: '還沒有訊息。' }));
      d.msgs.forEach(function (m) {
        var bub = h('div', { cls: 'bub' + (m.mine ? ' mine' : '') + (m.recalled ? ' recalled' : '') }, h('div', { cls: 'meta' }, h('span', { cls: 'chip', text: m.recalled ? '已收回' : m.type }), ' ', h('span', { cls: 'nw', text: m.mine ? '我' : m.from_role }), m.mine ? '' : h('span', { cls: 'nw', text: ' ' + m.from_name }), '｜' + String(m.ts).slice(5, 16).replace('T', ' ')), m.ref ? h('div', { cls: 'ref', text: '引用：' + m.ref.label }) : null, h('div', { cls: 'txt', text: m.recalled ? '（已收回）' : m.text }));
        if (m.type === '公告' && m.member_n !== undefined) bub.appendChild(h('div', { cls: 'muted', text: '已讀 ' + m.read_n + '／' + m.member_n }));
        if (m.mine && !m.recalled) bub.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '收回', on: { click: function () { api('group.recall', { groupId: gid, msgId: m.id }).then(draw).catch(fail); } } }));
        if (!m.recalled && d.group.kind === '職類' && gid === 'ROLE:' + S.me.acting_role && m.type !== '公告') bub.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '整理成院內問答', on: { click: function () { var f = $('faqq'); if (f) { $('faqa').value = m.text.slice(0, 300); S.faqFrom = m.id; f.focus(); f.scrollIntoView({ block: 'center' }); } } } }));
        if (d.group.can_announce && m.type === '公告' && !m.recalled) bub.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: m.pinned ? '取消置頂' : '置頂', on: { click: function () { api('group.pin', { groupId: gid, msgId: m.id, pin: !m.pinned }).then(draw).catch(fail); } } }));
        list.appendChild(bub);
      });
      right.appendChild(list);
      var types = d.types.filter(function (t) { return t !== '公告' || d.group.can_announce; });
      var ta = h('textarea', { id: 'gtxt', maxlength: '300', on: { input: function () { v.text = ta.value; } } }); ta.value = v.text;
      right.appendChild(h('div', { cls: 'composer' }, h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '類型' }), seg(types, v.type, function (t) { v.type = t; draw(d); }, '', '訊息類型')),
        h('div', { cls: 'field' }, h('label', { for: 'gtxt', text: '訊息（300 字內，不談個別病人）' }), ta),
        v.type === '公告' ? h('label', { cls: 'chk' }, h('input', { type: 'checkbox', checked: v.pin, on: { change: function (e) { v.pin = e.target.checked; } } }), ' 置頂') : null,
        h('button', { cls: 'btn', type: 'button', text: '送出', on: { click: function () { api('group.send', { groupId: gid, type: v.type, text: v.text, pin: v.pin }).then(function (nd) { v.text = ''; draw(nd); }).catch(fail); } } })));
      list.scrollTop = list.scrollHeight;
      if (d.group.kind === '職類' && gid === 'ROLE:' + S.me.acting_role) right.appendChild(faqPanel(gid));
      api('group.read', { groupId: gid }).then(pollInbox).catch(function () {});
    };
    api('group.msgs', { groupId: gid }).then(draw).catch(function (e) { fail(e, right); });
  }
  /** 任務動作：收到的可承接或退回（須原因）；我交出且被退回的可改派 */
  function taskActions(t) {
    var box = h('div', { cls: 'inline' });
    if (t.mine_out) {
      if (t.status !== '退回') return null;
      var sel = h('select', { 'aria-label': '改派職類' }, S.info.roles.map(function (r) { return h('option', { value: r.id, text: r.name }); }));
      box.appendChild(sel);
      box.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '改派', on: { click: function () { api('handoffRespond', { taskId: t.id, action: '改派', toRole: sel.value }).then(function () { toast('已改派'); route(); }).catch(fail); } } }));
      return box;
    }
    box.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '承接', on: { click: function () { api('handoffRespond', { taskId: t.id, action: '承接' }).then(function (r) { location.hash = '#/p/' + r.person_id; }).catch(fail); } } }));
    if (t.type === '交班') {
      var why = h('div');
      box.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '退回', on: { click: function () {
        clear(why).appendChild(seg(S.info.enums.HANDOFF_REJECT, null, function (v) { api('handoffRespond', { taskId: t.id, action: '退回', reason: v }).then(function () { toast('已退回：' + v); route(); }).catch(fail); }, '', '退回原因'));
      } } }));
      box.appendChild(why);
    }
    return box;
  }
  function addResult(d) {
    return h('div', { cls: 'alert mid', role: 'status' },
      d.notFound.length ? h('p', { text: '尚未建檔 ' + d.notFound.length + ' 位（末四碼 ' + d.notFound.map(function (x) { return x.mrn_tail; }).join('、') + '），請按「新病人建檔」。' }) : null,
      d.errors.map(function (e) { return h('div', { text: e }); }));
  }
  function openByMrn(mrn, by, setting, box) {
    api('openPatient', { mrn: mrn, birthYear: by, setting: setting }).then(function (b) {
      if (!b.found && !b.person) { box.appendChild(h('p', { cls: 'alert mid', text: '查無此病人，請建檔。' })); return; }
      S.b = b; S.draft = null; location.hash = '#/p/' + b.person.person_id;
    }).catch(function (e) { box.appendChild(h('p', { cls: 'err', role: 'alert', text: e.message })); });
  }
  function dzName(id) { var d = (S.info.diseases || []).filter(function (x) { return x.id === id; })[0]; return d ? d.name : id; }

  function createForm(parent) {
    var f = h('section', { cls: 'panel' });
    var v = { sex: '', setting: '門診', learner: '', literacy: '未評估', diseases: [] };
    var mrn = h('input', { type: 'text', id: 'cmrn' }), by = h('input', { type: 'text', id: 'cby', inputmode: 'numeric', maxlength: '4' }), title = h('input', { type: 'text', id: 'ctitle', placeholder: '例：陳先生' });
    var med = h('textarea', { id: 'cmed', placeholder: '可貼上藥單（藥師、醫師）' });
    var dzWrap = h('div');
    function draw() {
      clear(dzWrap).appendChild(seg(S.info.diseases.filter(function (d) { return d.level !== '共病標記'; }).map(function (d) { return { v: d.id, t: d.name }; }), v.diseases, function (id) { var i = v.diseases.indexOf(id); if (i >= 0) v.diseases.splice(i, 1); else v.diseases.push(id); draw(); }, '', '疾病'));
      dzWrap.appendChild(h('div', { cls: 'hint', text: S.me.caps.indexOf('confirm_disease') >= 0 ? '您的職類可確認疾病。' : '您的職類勾選後記為「病人自述、未確認」，只啟動共通與安全內容。' }));
      dzWrap.appendChild(h('details', null, h('summary', { text: '共病標記' }), seg(S.info.diseases.filter(function (d) { return d.level === '共病標記'; }).map(function (d) { return { v: d.id, t: d.name }; }), v.diseases, function (id) { var i = v.diseases.indexOf(id); if (i >= 0) v.diseases.splice(i, 1); else v.diseases.push(id); draw(); })));
    }
    draw();
    var sx = h('div'), st = h('div'), lt = h('div'), li = h('div');
    function re() { clear(sx).appendChild(seg(['女', '男', '其他'], v.sex, function (x) { v.sex = x; re(); }, '', '性別')); clear(st).appendChild(seg(S.info.enums.SETTING, v.setting, function (x) { v.setting = x; re(); }, '', '場域')); clear(lt).appendChild(seg(S.info.enums.LEARNER_TYPE, v.learner, function (x) { v.learner = x; re(); }, '', '主要學習者')); clear(li).appendChild(seg(S.info.enums.LITERACY, v.literacy, function (x) { v.literacy = x; re(); }, '', '識能')); }
    re();
    var err = h('div');
    f.appendChild(h('h2', { text: '新病人建檔' }));
    f.appendChild(h('div', { cls: 'inline' }, h('div', { cls: 'field' }, h('label', { for: 'cmrn', text: '病歷號' }), mrn), h('div', { cls: 'field' }, h('label', { for: 'cby', text: '出生年（西元）' }), by), h('div', { cls: 'field' }, h('label', { for: 'ctitle', text: '稱謂（單張與畫面使用）' }), title)));
    f.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '性別' }), sx));
    f.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '場域' }), st));
    f.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '疾病' }), dzWrap));
    f.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '主要學習者' }), lt));
    f.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '健康識能（簡短篩檢）' }), li, h('div', { cls: 'hint', text: '篩檢題目與中文版依據見部署指南；未評估者照一般原則。' })));
    if (S.me.caps.indexOf('med_list') >= 0) f.appendChild(h('div', { cls: 'field' }, h('label', { for: 'cmed', text: '藥單' }), med));
    f.appendChild(h('button', { cls: 'btn', type: 'button', text: '建檔並開啟', on: { click: function () {
      var conf = S.me.caps.indexOf('confirm_disease') >= 0;
      // 性別必選，不給預設（V15）
      if (!v.sex) { clear(err).appendChild(h('p', { cls: 'err', role: 'alert', text: '請選性別' })); return; }
      api('createPatient', { mrn: mrn.value, birthYear: by.value, sex: v.sex, title: title.value, setting: v.setting, learners: v.learner ? [{ type: v.learner, literacy: v.literacy, giver: true }] : [], literacy: v.literacy, diseases: v.diseases.map(function (d) { return { id: d, status: conf ? '已確認' : '自述未確認' }; }), medText: S.me.caps.indexOf('med_list') >= 0 ? med.value : '' })
        .then(function (b) { S.b = b; S.draft = null; location.hash = '#/p/' + b.person.person_id; }).catch(function (e) { fail(e, err); });
    } } }));
    f.appendChild(err);
    parent.insertBefore(f, parent.firstChild);
    mrn.focus();
  }

  /* ---------- 備診（電腦前查病歷） ---------- */
  function prep(app, pid) {
    app.appendChild(h('p', { cls: 'muted', text: '讀取中…' }));
    api('recomputeQueue', { personId: pid }).then(function (b) {
      S.b = b; clear(app);
      app.appendChild(ptitle(b));
      app.appendChild(h('p', { cls: 'lede', text: '只列出這次要從病歷查、而且已過期或從未填過的項目。有效期內的資料已折疊。' }));
      var vals = {}, medChanges = null, dz = [];
      var due = b.elements_prep.filter(function (e) { return e.due; }), ok = b.elements_prep.filter(function (e) { return !e.due; });
      var form = h('div');
      if (!due.length) form.appendChild(h('p', { cls: 'alert info', text: '這次沒有要從病歷查的項目。' }));
      due.forEach(function (e) { form.appendChild(elementField(e, vals, null)); });
      if (ok.length) form.appendChild(h('details', null, h('summary', { text: '已有資料（' + ok.length + '）' }), h('ul', null, ok.map(function (e) { return h('li', { text: e.name + '：' + e.current.value + '（' + roleNm(e.current.by_role) + ' ' + String(e.current.ts).slice(0, 10) + '）' }); }))));
      app.appendChild(form);
      var sus = b.diseases.filter(function (d) { return d.status === '疑似' || d.status === '自述未確認'; });
      if (sus.length && S.me.caps.indexOf('confirm_disease') >= 0) {
        app.appendChild(h('h2', { text: '待確認的疾病' }));
        sus.forEach(function (d) {
          var c = { id: d.id, status: null };
          app.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: d.name + '（' + d.status + (d.src ? '｜' + d.src : '') + '）' }), seg(['已確認', '排除'], null, function (s) { c.status = s; dz = dz.filter(function (x) { return x.id !== d.id; }).concat([c]); toast(d.name + '：' + s); })));
        });
      }
      if (S.me.caps.indexOf('med_list') >= 0) app.appendChild(medBox(b, function (mc) { medChanges = mc; }));
      var err = h('div'); app.appendChild(err);
      setBar([h('div', { cls: 'msg', text: '備診資料只存為暫存，面對病人送出時才寫入；' + (b.prep ? '目前已有暫存。' : '72 小時未使用自動作廢。') }),
        h('button', { cls: 'btn', type: 'button', text: '存為暫存', on: { click: function () {
          api('savePrep', { personId: pid, elements: vals, diseases: dz.filter(function (x) { return x.status; }), medChanges: medChanges || [] }).then(function () { toast('已存為暫存'); location.hash = '#/'; }).catch(function (e) { fail(e, err); });
        } } })]);
    }).catch(function (e) { fail(e, app); });
  }
  function elementField(e, vals, onChange) {
    var w = h('div', { cls: 'field', 'data-el': e.id }), box = h('div');
    function draw() {
      clear(box);
      var multi = e.type === '多選';
      var cur = vals[e.id] !== undefined ? (vals[e.id].value !== undefined ? vals[e.id].value : vals[e.id]) : null;
      var arr = multi ? String(cur || '').split('|').filter(Boolean) : cur;
      box.appendChild(seg(e.options, arr, function (o) {
        if (multi) { var a = String(cur || '').split('|').filter(Boolean); var i = a.indexOf(o); if (i >= 0) a.splice(i, 1); else a.push(o); vals[e.id] = a.join('|'); }
        else vals[e.id] = o;
        draw(); if (onChange) onChange();
      }, '', e.name));
      if (e.numeric) { var n = h('input', { type: 'number', 'aria-label': e.name + ' 數值（選填）', placeholder: '數值（選填）', style: { maxWidth: '180px', marginTop: '6px' }, on: { change: function () { var v = vals[e.id]; vals[e.id] = { value: v && v.value !== undefined ? v.value : v, num: n.value }; } } }); box.appendChild(n); }
    }
    draw();
    w.appendChild(h('span', { cls: 'lab', text: e.name + (e.required ? '' : '（選填）') + (e.followup ? '　依評估追問' : '') }));
    w.appendChild(box);
    var hint = [];
    if (e.current) hint.push('上次：' + e.current.value + '（' + roleNm(e.current.by_role) + ' ' + String(e.current.ts).slice(0, 10) + (e.current.reason ? '，' + e.current.reason : '') + '）');
    if (e.validity_basis === '設計預設' && S.me && S.me.permission !== 'L1') hint.push('有效期為設計預設，非指引數值');
    if (e.outcome) hint.push('成效追蹤用：只在基線與追蹤時點出現，可略過');
    if (hint.length) w.appendChild(h('div', { cls: 'hint', text: hint.join('；') }));
    return w;
  }
  function medBox(b, onSet) {
    var w = h('section', null, h('h2', { text: '用藥核對' }));
    var ta = h('textarea', { 'aria-label': '貼上目前藥單', placeholder: '貼上目前藥單，每行一個品項' });
    var res = h('div');
    w.appendChild(h('p', { cls: 'muted', text: '目前 ' + b.meds.length + ' 項；' + (b.med_list_age_days === null ? '尚未核對' : '距上次核對 ' + Math.round(b.med_list_age_days) + ' 天') + (b.med_list_stale ? '（已過期）' : '') }));
    w.appendChild(ta);
    w.appendChild(h('button', { cls: 'btn ghost', type: 'button', text: '比對變更', on: { click: function () {
      api('importMeds', { personId: b.person.person_id, text: ta.value }).then(function (d) {
        clear(res);
        var ch = d.parsed.filter(function (m) { return m.change === '新增'; }).map(function (m) { return { med_id: m.med_id, change: '新增', raw: m.raw }; })
          .concat(d.stopped.map(function (m) { return { med_id: m.med_id, change: '停用' }; }))
          .concat(d.parsed.filter(function (m) { return m.change === '無變動'; }).map(function (m) { return { med_id: m.med_id, change: '無變動', raw: m.raw }; }));
        onSet(ch);
        res.appendChild(h('table', { cls: 't' }, h('tr', null, h('th', { text: '品項' }), h('th', { text: '變更' })), d.parsed.concat(d.stopped).map(function (m) { return h('tr', null, h('td', { text: m.name }), h('td', { text: m.change })); })));
        if (d.unparsed.length) res.appendChild(h('p', { cls: 'alert mid', text: '無法對應 ' + d.unparsed.length + ' 行，請人工確認：' + d.unparsed.join('、') }));
      }).catch(function (e) { fail(e, res); });
    } } }));
    w.appendChild(res);
    return w;
  }
  function ptitle(b) {
    var p = b.person;
    return h('div', { cls: 'ptitle' }, h('span', { cls: 'name', text: p.title || '未填稱謂' }), h('span', { cls: 'tail', 'aria-label': '病歷號末四碼', text: p.tail }),
      h('span', { cls: 'meta', text: p.sex + '｜' + p.age_band + '｜' + b.setting + (b.episode && b.episode.readmit ? '｜30 天內再入院' : '') + (p.care_goal !== '一般' ? '｜' + p.care_goal : '') + '｜' + b.role_name + '：' + b.stage }),
      h('div', { cls: 'chips' }, b.diseases.map(function (d) { return h('span', { cls: 'chip ' + (d.status === '已確認' ? 'ok' : 'warn'), text: d.name + (d.status === '已確認' ? '' : '（' + d.status + '）') + (d.disclosure !== '已知情' ? '｜' + (d.disclosure || '未確認') : '') }); })));
  }

  /* ---------- 床邊 ---------- */
  function patient(app, pid) {
    app.appendChild(h('p', { cls: 'muted', text: '讀取中…' }));
    var load = S.b && S.b.person.person_id === pid ? Promise.resolve(S.b) : api('recomputeQueue', { personId: pid });
    load.then(function (b) {
      S.b = b;
      if (!S.draft || S.draft.pid !== pid) { S.draft = newDraft(b); var saved = loadDraft(pid); if (saved) S.draft.resume = saved; }
      renderPatient(app);
    }).catch(function (e) { fail(e, app); });
  }
  function newDraft(b) {
    var prevAck = b.handover ? [] : ['S', 'B', 'A', 'R'];
    return {
      pid: b.person.person_id, openTs: Date.now(), ackStart: null, ackSeconds: 0, ack: prevAck, clicks: 0, dirty: false, idemKey: uid(),
      events: [], learnerIds: b.learners.filter(function (l) { return l.present; }).map(function (l) { return l.id; }),
      communication: '無困難', time: '一般', curiosity: b.curiosity || '一般', primary: b.primary || '', wanted: '',
      elements: {}, results: {}, added: [], commits: {}, followups: {}, overrideReason: '', nextRoles: [], nextNote: '', refer: [], nextAppt: null, readmitBarrier: '', decisions: [], medChanges: null, notDone: '',
      certainty: b.certainty || '', continuity: '', bed: b.bed && b.bed.value || '', deliverSkip: {}
    };
  }
  function touch() { S.draft.clicks++; S.draft.dirty = true; }
  /* ---------- D51 病人提問（14.12、14.17：典型兩下到答案；搜尋與排序在本機） ---------- */
  /** 選項列：點選即更新按下狀態（不需重繪整張卡） */
  function liveSeg(options, value, onPick, cls, label) {
    var w = seg(options, value, function (v) { Array.prototype.forEach.call(w.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === v)); }); onPick(v); }, cls, label);
    return w;
  }
  /** 三層求助句（與單張同一套標題與配色）；related＝只展開撥 119 與立刻去急診，當天層收合 */
  function helpTiers(H, heads, collapseDay) {
    heads = heads || {};
    var tier = function (cls, head, list) { return list && list.length ? h('div', { cls: 'tier ' + cls }, h('div', { cls: 'tier-head', text: head }), h('ul', null, list.map(function (x) { return h('li', { text: x.text || x }); }))) : null; };
    var day = tier('lday', heads.lday || '當天就要處理', H.lday);
    return h('div', { cls: 'pq-help' }, tier('l119', heads.l119 || '立刻撥 119', H.l119), tier('led', heads.led || '立刻去急診', H.led),
      collapseDay && day ? h('details', null, h('summary', { text: '其他求助句（當天處理）' }), day) : day);
  }
  function pqNorm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function pqSearch(P, q) {
    var k = pqNorm(q); if (!k) return [];
    var topicHit = {}; P.topics.forEach(function (t) { if ([t.name, t.lay].concat(t.keywords).some(function (w) { return w && (pqNorm(w).indexOf(k) >= 0 || k.indexOf(pqNorm(w)) >= 0); })) topicHit[t.id] = 1; });
    var typeHit = {}; P.qtypes.forEach(function (t) { if ([t.name].concat(t.keywords).some(function (w) { return w && (k.indexOf(pqNorm(w)) >= 0 || pqNorm(w).indexOf(k) >= 0); })) typeHit[t.id] = 1; });
    // v1.5（D55-05）同義詞：藥名、成分、院內商品名、藥品類別白話名、疾病名稱與口語名（大小寫不拘）
    var synItem = {}, synDz = {};
    (P.syn || []).forEach(function (s) { var w = pqNorm(s[0]); if (w && w.length >= 2 && (k.indexOf(w) >= 0 || (k.length >= 3 && w.indexOf(k) >= 0))) { if (s[1].indexOf('item:') === 0) synItem[s[1].slice(5)] = 1; else synDz[s[1].slice(3)] = 1; } });
    var score = function (x, fuzzy) {
      var sc = 0;
      if (pqNorm(x.ask).indexOf(k) >= 0) sc += 3;
      x.keywords.forEach(function (w) { if (w && (k.indexOf(pqNorm(w)) >= 0 || pqNorm(w).indexOf(k) >= 0)) sc += 2; });
      if (x.item_id && synItem[x.item_id]) sc += 3;
      if ((x.diseases || []).some(function (d) { return synDz[d]; })) sc += 1;
      if (fuzzy && !sc) { var best = Math.max(pqDice(k, x.ask), Math.max.apply(null, [0].concat(x.keywords.map(function (w) { return pqDice(k, w); })))); if (best >= 0.5) sc = 1 + best; }
      var direct = sc > 0 || topicHit[x.topic_id];
      if (topicHit[x.topic_id]) sc += 1; if (typeHit[x.qtype] && direct) sc += 1;
      return direct ? sc : 0;
    };
    var run = function (fuzzy) { return P.qa.filter(function (x) { return x.ask; }).map(function (x) { return { x: x, sc: score(x, fuzzy) }; }).filter(function (o) { return o.sc > 0; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 8).map(function (o) { return o.x; }); };
    var L = run(false);
    // 錯字容錯：找不到時才用字元雙字組相似度（只比題目與關鍵字，不比答案）
    return L.length ? L : run(true);
  }
  function pqDice(a, b) {
    a = pqNorm(a); b = pqNorm(b); if (!a || !b) return 0; if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    var bg = function (s) { var o = {}; for (var i = 0; i < s.length - 1; i++) { var g = s.substr(i, 2); o[g] = (o[g] || 0) + 1; } return o; };
    var A = bg(a), B = bg(b), inter = 0, na = a.length - 1, nb = b.length - 1;
    Object.keys(A).forEach(function (g) { if (B[g]) inter += Math.min(A[g], B[g]); });
    return 2 * inter / (na + nb);
  }
  /** v1.5（D55-05）答案狀態五類：可直接使用／需要補問／需轉介／內容未核准／資料不足 */
  function pqStatus(b, x) {
    if (!x.answer) return ['資料不足', 'st-none'];
    if (x.signed === false) return ['內容未核准', 'st-unsigned'];
    var d = S.draft, e = x.ask_element && (b.elements_bedside || []).filter(function (y) { return y.id === x.ask_element && y.mine && y.due; })[0];
    if (e && !(d && d.elements && d.elements[e.id] !== undefined)) return ['需要補問', 'st-ask'];
    if (x.owner && String(x.owner).split(/[|｜、,，]/).indexOf(S.me.acting_role) < 0) return ['需轉介', 'st-refer'];
    return ['可直接使用', 'st-ok'];
  }
  function pqClose() { if (S.pqMiss && S.pqMiss.length >= 2) { api('pq.miss', { word: S.pqMiss }).catch(function () { }); S.pqMiss = ''; } var o = $('pqsheet'); if (o) o.remove(); document.body.classList.remove('pq-open'); var y = S.pqScroll || 0; var f = $('pqopen'); if (f) f.focus(); window.scrollTo(0, y); }
  function pqOpen(b, preset) {
    var P = b.pq; if (!P) return;
    S.pqScroll = window.scrollY; S.pqOpenTs = Date.now(); S.pqMiss = '';
    var old = $('pqsheet'); if (old) old.remove();
    var body = h('div', { cls: 'pq-body' });
    var dlg = h('div', { id: 'pqsheet', cls: 'pqsheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pqh' },
      h('div', { cls: 'pq-head' }, h('h2', { id: 'pqh', text: '病人問了問題' }), h('button', { cls: 'btn quiet', type: 'button', text: '回到原畫面', on: { click: pqClose } })), body);
    dlg.addEventListener('keydown', function (e) { if (e.key === 'Escape') pqClose(); });
    document.body.appendChild(dlg); document.body.classList.add('pq-open');
    if (preset) pqCard(b, body, preset); else pqHome(b, body);
    var f = dlg.querySelector('input, button'); if (f) f.focus();
  }
  /** v1.4（D52）網路不穩時的本機分流：只用病人頁已載入的已簽核答案與求助句；不新增任何內容 */
  function pqOfflineTri(b, qt, qa) {
    var owner = String(qa.owner || '').split('|')[0];
    return { route: '有內容', answer: qa.answer, offline: true, owner: owner, owner_name: roleNm(owner), will_followup: false,
      help: qt.help_first ? (b.pq.pv_help || b.pq.help) : null, heads: b.pq.heads || {}, actions: ['已照答', '轉問'], due_text: '' };
  }
  /** v1.4（D52）提問順便帶出一題相關評估：本職類、本次到期、尚未填，且每次照護最多一題 */
  function pqAskElement(b, qa) {
    var d = S.draft; if (!qa || !qa.ask_element || !d || d.pqElAsked) return null;
    var e = (b.elements_bedside || []).filter(function (x) { return x.id === qa.ask_element && x.mine && x.due && d.elements[x.id] === undefined; })[0];
    if (!e) return null;
    return h('div', { cls: 'pq-el' }, h('span', { cls: 'lab', text: '順便問一題（選填）' }), h('span', { text: e.name }),
      h('button', { cls: 'btn quiet', type: 'button', text: '去填這題', on: { click: function () {
        d.pqElAsked = qa.qa_id; touch(); pqClose(); renderPatient($('app'));
        var t = document.querySelector('[data-el="' + e.id + '"]'); if (t) { t.scrollIntoView({ block: 'center' }); var f = t.querySelector('button, input, select'); if (f) f.focus(); }
      } } }));
  }
  /* v1.4 離線待送：只存處置與防重複鍵，不存病人頁內容；登出時與草稿一起清除；不自動重送 */
  function pqOutKey() { return S.me ? DRAFT_PREFIX + 'pqout.' + S.me.person_id + '.' + S.me.acting_role : ''; }
  function pqOutGet() { var ls = store(), k = pqOutKey(); if (!ls || !k) return []; try { return JSON.parse(ls.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function pqOutSet(L) { var ls = store(), k = pqOutKey(); if (!ls || !k) return; try { if (L.length) ls.setItem(k, JSON.stringify(L)); else ls.removeItem(k); } catch (e) { } }
  function pqOutPush(o) { var L = pqOutGet(); L.push(o); pqOutSet(L); pqOutRefresh(o.pid); }
  /** 不重繪整頁（保留捲動與草稿畫面），只換掉或補上病人頁頂端的待送列 */
  function pqOutRefresh(pid) { var app = $('app'), old = app && app.querySelector('.pq-out'), nb = pqOutBanner(pid); if (old) old.remove(); if (nb && app) app.insertBefore(nb, app.firstChild); }
  function pqOutBanner(pid) {
    var L = pqOutGet().filter(function (o) { return o.pid === pid; }); if (!L.length) return null;
    var btn = h('button', { cls: 'btn', type: 'button', text: '重送', on: { click: function () {
      btn.disabled = true;
      L.reduce(function (p, o) { return p.then(function () { return api('pq.submit', o.payload, { idemKey: o.idemKey }).then(function () { pqOutSet(pqOutGet().filter(function (x) { return x.idemKey !== o.idemKey; })); }); }); }, Promise.resolve())
        .then(function () { toast('已全部送出'); renderPatient($('app')); }).catch(function (e) { btn.disabled = false; toast(e.code === 'NETWORK' ? '仍無法連線，資料還在這台裝置' : e.message); renderPatient($('app')); });
    } } });
    return h('div', { cls: 'alert mid pq-out', role: 'status' }, h('span', { text: '有 ' + L.length + ' 筆提問處置待送（' + L.map(function (o) { return o.action; }).join('、') + '）' }), btn);
  }
  function pqForItem(b, q) {
    if (!b.pq || !q || q.item_id === 'HELP') return [];
    var L = (b.pq.qa || []).filter(function (x) { return x.ask && x.answer; });
    var same = L.filter(function (x) { return x.item_id && x.item_id === q.item_id; });
    var topic = L.filter(function (x) { return same.indexOf(x) < 0 && q.topic_id && x.topic_id === q.topic_id; });
    return same.concat(topic).slice(0, 3);
  }
  function pqItemBtn(b, body, x) {
    return h('button', { cls: 'pq-item', type: 'button', 'data-qa': x.qa_id, on: { click: function () { pqCard(b, body, { qa: x }); } } },
      h('span', { cls: 't', text: x.ask }), h('span', { cls: 'muted', text: roleNm(String(x.owner || '').split('|')[0]) + (x.diseases && x.diseases.length ? '｜' + x.diseases.map(dzName).join('、') : '') }),
      (function () { var st = pqStatus(b, x); return h('span', { cls: 'pq-st ' + st[1], text: st[0] }); })());
  }
  function pqHome(b, body) {
    var P = b.pq; clear(body);
    var res = h('div', { cls: 'pq-res', 'aria-live': 'polite' });
    var inp = h('input', { type: 'search', id: 'pqq', 'aria-label': '搜尋病人的問題', placeholder: '打病人說的話，例如：腳腫、保健品（不要打姓名）', maxlength: '40', autocomplete: 'off', on: { input: function () {
      clear(res); var L = pqSearch(P, inp.value);
      if (!inp.value.trim()) return;
      if (!L.length) { S.pqMiss = inp.value.trim().slice(0, 20); res.appendChild(h('p', { cls: 'muted', text: '找不到相符的題目。可以從下面的問題類型轉問。' })); return; }
      S.pqMiss = '';
      res.appendChild(h('div', { cls: 'pq-list' }, L.map(function (x) { return pqItemBtn(b, body, x); })));
    } } });
    body.appendChild(h('div', { cls: 'field' }, inp)); body.appendChild(res);
    var pred = P.predict.map(function (id) { return P.qa.filter(function (x) { return x.qa_id === id; })[0]; }).filter(Boolean);
    body.appendChild(h('h3', { text: '這位病人可能會問' }));
    body.appendChild(pred.length ? h('div', { cls: 'pq-list' }, pred.map(function (x) { return pqItemBtn(b, body, x); })) : h('p', { cls: 'muted', text: '目前沒有已簽核的題目；請用下面的問題類型轉問。' }));
    body.appendChild(h('h3', { text: '依問題類型' }));
    body.appendChild(h('div', { cls: 'pq-grid' }, P.qtypes.map(function (t) {
      var L = P.qa.filter(function (x) { return x.qtype === t.id && x.ask; });
      var det = h('details', { cls: 'pq-type' + (L.length ? '' : ' empty') }, h('summary', null, h('span', { text: t.name }), h('span', { cls: 'muted', text: L.length ? L.length + ' 題' : (t.boundary === '可初答' ? '轉問' : '轉主責') })));
      if (L.length) det.appendChild(h('div', { cls: 'pq-list' }, L.map(function (x) { return pqItemBtn(b, body, x); })));
      det.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '其他「' + t.name + '」的問題', on: { click: function () { pqCard(b, body, { qtype: t }); } } }));
      return det;
    })));
  }
  function pqCard(b, body, sel) {
    var P = b.pq; clear(body);
    var qt = sel.qtype || P.qtypes.filter(function (t) { return t.id === sel.qa.qtype; })[0] || {};
    var st = { text: '', topic: sel.qa ? sel.qa.topic_id : '', familiar: '', mode: b.setting === '住院' ? '住院期限' : '', date: '', tri: null };
    var back = h('button', { cls: 'btn quiet', type: 'button', text: '換一題', on: { click: function () { pqHome(b, body); } } });
    var card = h('article', { cls: 'pq-card', 'aria-live': 'polite' });
    body.appendChild(h('div', { cls: 'pq-top' }, back, h('span', { cls: 'chip', text: qt.name || '' })));
    body.appendChild(h('p', { cls: 'pq-ask', text: sel.qa ? sel.qa.ask : '其他「' + (qt.name || '') + '」的問題' }));
    if (!sel.qa) {
      body.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '主題' }), liveSeg(P.topics.filter(function (t) { return t.id !== 'TP_HELP'; }).map(function (t) { return { v: t.id, t: t.lay || t.name }; }), st.topic, function (v) { st.topic = v; }, 'wrap', '主題')));
      var ta = h('input', { type: 'text', 'aria-label': '病人或家屬怎麼說（選填，80 字內）', maxlength: '80', placeholder: '病人或家屬怎麼說（選填；不要寫姓名、電話、病歷號）', on: { change: function () { st.text = ta.value; } } });
      body.appendChild(h('div', { cls: 'field' }, ta));
      body.appendChild(h('button', { cls: 'btn', type: 'button', text: '看怎麼回答', on: { click: function () { st.text = ta.value; run(); } } }));
    }
    body.appendChild(card);
    if (b.kit && b.kit.l3 && !b.kit.hidden && sel.qa && (sel.qa.item_id || sel.qa.med_class)) {
      var cid = (b.kit.claims || []).filter(function (c) { return c.items.indexOf(sel.qa.item_id) >= 0 || (sel.qa.med_class && c.items.indexOf('MC_' + sel.qa.med_class) >= 0); }).map(function (c) { return c.id; });
      var kc = kitClaimList(b.kit, cid); if (kc) body.appendChild(h('details', { cls: 'kit' }, h('summary', { text: '臨床事實（醫事端，' + cid.length + '）' }), kc));
    }
    function run() {
      clear(card).appendChild(h('p', { cls: 'muted', text: '判斷中…' }));
      api('pq.triage', { personId: b.person.person_id, qtype: qt.id, qaId: sel.qa ? sel.qa.qa_id : '', topicId: st.topic, text: st.text }).then(function (r) { st.tri = r; draw(); }).catch(function (e) {
        // v1.4（D52）：網路不穩時，已載入的題目仍可查——用病人頁已載入的答案與求助句在本機顯示；不做紅旗分流（只對自由文字），所以只限選定題目
        if (e && e.code === 'NETWORK' && sel.qa && sel.qa.answer && !st.text) { st.tri = pqOfflineTri(b, qt, sel.qa); draw(); } else fail(e, card);
      });
    }
    function draw() {
      var r = st.tri; clear(card);
      var red = r.route === '紅旗';
      var acts = h('div', { cls: 'inline pq-acts' });
      if (red) card.appendChild(h('p', { cls: 'alert high', role: 'alert', text: '病人描述的情況可能需要立即求助，先照下面的求助句處理。' }));
      if (r.offline) card.appendChild(h('p', { cls: 'alert mid', role: 'status', text: '網路不穩：顯示的是開啟病人頁時載入的內容。按鈕會先存在這台裝置，連線後按「重送」。' }));
      if (r.answer) card.appendChild(h('div', { cls: 'pq-say' }, h('span', { cls: 'lab', text: '可以這樣回答' }), h('p', { cls: 'pq-answer', text: r.answer }), r.will_followup ? h('p', { cls: 'pq-next', text: '我能說到這裡，' + r.owner_name + (P.texts.will_reply || '會再和您說明') + '。' }) : null));
      // v1.2.2（三視窗複審 CW01-014）：接球句是承諾，只在「轉問」已寫入（有主責、期限、逾期保底）後才給醫事人員說出
      else if (r.catch_text && !red) card.appendChild(h('div', { cls: 'pq-say' }, h('span', { cls: 'lab', text: r.route === '不代答' || r.route === '知情' ? '這一題由' + r.owner_name + '回答' : '目前沒有可直接回答的內容' }), h('p', { cls: 'pq-hint', text: '請按「轉問' + r.owner_name + '」，送出後畫面會給您要告訴病人的話。主責本人可當面說明。' })));
      if (red) card.appendChild(acts);
      if (r.help) card.appendChild(helpTiers(r.help, r.heads, red));
      if (r.answer && !red) { var chip = pqAskElement(b, sel.qa); if (chip) card.appendChild(chip); }
      if (r.answer && (sel.qa && sel.qa.limit || r.due_text)) card.appendChild(h('p', { cls: 'pq-staff' }, h('span', { cls: 'chip', text: '醫事端' }), ' ' + [sel.qa && sel.qa.limit ? '說到哪：' + sel.qa.limit : '', '轉問期限：' + r.due_text].filter(Boolean).join('｜')));
      if (sel.qa && (sel.qa.pro.length || sel.qa.sources.length)) card.appendChild(h('details', { cls: 'pq-pro' }, h('summary', { text: '專業要點與依據（醫事端）' }),
        sel.qa.pro.length ? h('ul', null, sel.qa.pro.map(function (x) { return h('li', { text: x }); })) : null,
        h('div', { cls: 'muted', text: '建議強度：' + (sel.qa.strength || '未分級') + (sel.qa.loc ? '｜' + sel.qa.loc : '') }),
        h('div', null, sel.qa.sources.map(function (s) { return h('div', { cls: 'muted', text: s.label + (s.verified ? '' : '【未經查證】') }); }))));
      else if (sel.qa && P.undisclosed) card.appendChild(h('p', { cls: 'muted', text: '病人尚未確認知道診斷：專業要點不在這裡顯示，請在病人不在場時看焦點卡。' }));
      var faqs = st.faqs = (P.faq || []).filter(function (f) { return (f.qtype && f.qtype === qt.id) && (!f.topic_id || f.topic_id === st.topic) || (sel.qa && f.med_class && f.med_class === sel.qa.med_class); });
      if (faqs.length && !P.undisclosed) card.appendChild(h('details', { cls: 'pq-pro' }, h('summary', { text: '院內問答（醫事端參考，' + faqs.length + ' 則）' }), faqs.map(function (f) { return h('div', { cls: 'faq-row' }, h('b', { text: f.q }), h('div', { text: f.a }), h('div', { cls: 'muted', text: f.role_name + '｜' + f.sources.map(function (s) { return s.label; }).join('、') + '｜' + f.loc }), h('div', { cls: 'muted', text: '不要照念給病人；病人端只說上面那句。' })); })));
      var mine = String(r.owner || '') === S.me.acting_role;
      st.familiar = mine ? st.familiar : '非本職類';
      if (mine) card.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '這題對您（選填，只有您與指導者看得到）' }), liveSeg(['本職類熟', '本職類不熟'], st.familiar, function (v) { st.familiar = v; }, '', '熟悉度')));

      if (r.actions.indexOf('已照答') >= 0) acts.appendChild(h('button', { cls: 'btn', type: 'button', text: '已照這句回答', on: { click: function () { submit('已照答'); } } }));
      if (r.actions.indexOf('依求助句') >= 0) acts.appendChild(h('button', { cls: 'btn danger', type: 'button', text: '依求助句處理', on: { click: function () { submit('依求助句'); } } }));
      if (r.actions.indexOf('主責已說明') >= 0) acts.appendChild(h('button', { cls: 'btn', type: 'button', text: '我是主責，已當面說明', on: { click: function () { submit('主責已說明'); } } }));
      if (r.actions.indexOf('轉問') >= 0) acts.appendChild(h('button', { cls: 'btn' + (r.actions.length > 1 ? ' quiet' : ''), type: 'button', text: '轉問' + r.owner_name, on: { click: function () { if (b.setting === '住院') submit('轉問'); else drawReply(); } } }));
      acts.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '問同職類', title: '送到本職類群組，只帶主題與問題類型，不帶病人', on: { click: function () {
        var topicName = (P.topics.filter(function (t) { return t.id === st.topic; })[0] || {}).name || '';
        var txt = '［病人提問，不含病人資訊］' + (qt.name || '') + (topicName ? '／' + topicName : '') + (sel.qa ? '：' + sel.qa.ask : '') + '。有人熟悉嗎？';
        api('group.send', { groupId: 'ROLE:' + S.me.acting_role, type: '提問', text: txt }).then(function () { toast('已送到本職類群組'); }).catch(fail);
      } } }));
      if (!red) card.appendChild(acts);
    }
    function drawReply() {
      var box = h('div', { cls: 'panel pq-reply' }, h('h3', { text: '和病人約好的回覆方式' }));
      var nextAppt = (b.appts && b.appts.upcoming || [])[0];
      var date = h('input', { type: 'date', 'aria-label': '回覆日期', min: ymdLocal(new Date()), value: nextAppt ? nextAppt.date : '' });
      box.appendChild(liveSeg(['下次回診', '約定電話', '病人自己來問'], st.mode, function (v) { st.mode = v; drawReplyRest(); }, '', '回覆方式'));
      var rest = h('div'); box.appendChild(rest);
      function drawReplyRest() {
        clear(rest);
        if (st.mode === '下次回診' || st.mode === '約定電話') rest.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: st.mode === '下次回診' ? '下次回診日' : '約好打電話的日期' }), date));
        if (st.mode) rest.appendChild(h('button', { cls: 'btn', type: 'button', text: '轉問並告訴病人', on: { click: function () { st.date = date.value; submit('轉問'); } } }));
      }
      card.appendChild(box); var f = box.querySelector('button'); if (f) f.focus();
    }
    function submit(action) {
      var payload = { personId: b.person.person_id, qtype: qt.id, qaId: sel.qa ? sel.qa.qa_id : '', topicId: st.topic, text: st.text, action: action, familiar: st.familiar, replyMode: action === '轉問' ? st.mode : '', replyDate: st.date, seconds: Math.round((Date.now() - (S.pqOpenTs || Date.now())) / 1000), faqShown: !!(st.faqs && st.faqs.length) };
      // v1.4：每次按下給一把防重複鍵；重送沿用同一把，伺服器只記一次
      var key = uid();
      api('pq.submit', payload, { idemKey: key })
        .then(function (r) {
          clear(card);
          if (action === '已照答' && st.tri && st.tri.answer) (S.pqAnswered = S.pqAnswered || []).push({ pid: b.person.person_id, answer: st.tri.answer });
          var fam = st.familiar && st.familiar !== '非本職類' ? '（自評：' + st.familiar + '）' : '';
          card.appendChild(h('p', { cls: 'alert info', role: 'status', text: action === '已照答' ? '已記錄：您照這句回答了' + fam + '。' + (r.pq.task_id ? '已自動轉介' + r.owner_name + '，會出現在對方的待辦。' : '') + '單張會印在「您問的問題」。'
            : action === '主責已說明' ? '已記錄：您以主責身分當面說明，這題已結案。'
            : action === '依求助句' ? '已記錄求助處理。需要時請通報事件。'
            : '已轉問' + r.owner_name + fam + '。回覆後，下一位見到病人的人會在病人頁最上方看到。' }));
          if (action === '轉問') card.appendChild(h('div', { cls: 'pq-say' }, h('span', { cls: 'lab', text: '告訴病人' }), h('p', { cls: 'pq-answer', text: [r.catch_text, r.reply_text].filter(Boolean).join('') })));
          card.appendChild(h('button', { cls: 'btn', type: 'button', text: '回到原畫面', on: { click: function () { pqClose(); S.b.pq.open = (S.b.pq.open || []).concat(r.pq.status === '待回覆' ? [r.pq] : []); renderPatient($('app')); } } }));
          var f = card.querySelector('button'); if (f) f.focus();
        }).catch(function (e) {
          if (!(e && e.code === 'NETWORK')) { toast(e.message); return; }
          pqOutPush({ pid: b.person.person_id, action: action, payload: payload, idemKey: key, ask: sel.qa ? sel.qa.ask : (qt.name || ''), ts: Date.now() });
          clear(card);
          card.appendChild(h('p', { cls: 'alert mid', role: 'status', text: '網路不通：這筆「' + action + '」已存在這台裝置，尚未送出。連線後在病人頁按「重送」。' + (action === '轉問' ? '還沒有回覆約定，先不要答應病人回覆日期。' : '') }));
          card.appendChild(h('button', { cls: 'btn', type: 'button', text: '回到原畫面', on: { click: function () { pqClose(); renderPatient($('app')); } } }));
        });
    }
    if (sel.qa) run();
  }
  /** v1.5.0 B01：醫事端職類卡（我的職類卡）與臨床事實；只讀，不記錄任何衛教 */
  function kitClaimList(K, ids) {
    var by = {}; (K.claims || []).forEach(function (c) { by[c.id] = c; });
    var L = ids.map(function (i) { return by[i]; }).filter(Boolean); if (!L.length) return null;
    return h('ul', { cls: 'kit-claims' }, L.map(function (c) {
      return h('li', null, h('span', { cls: 'chip' + (c.signed ? '' : ' warn'), text: c.facet + (c.signed ? '' : '・內容未核准') }), h('span', { text: ' ' + c.text }),
        h('div', { cls: 'hint', text: '強度 ' + c.strength + '｜' + c.loc + (c.not_for ? '｜不適用：' + c.not_for : '') + (c.tw ? '｜台灣適用性：' + c.tw : '') }));
    }));
  }
  function kitPanel(b) {
    var K = b.kit; if (!K) return null;
    var box = h('details', { cls: 'kit noprint' }, h('summary', { text: '我的職類卡' + (K.cards && K.cards.length ? '（' + K.cards.length + '）' : '') }));
    if (K.hidden) { box.appendChild(h('p', { cls: 'muted', text: K.reason })); return box; }
    if (!K.cards.length) box.appendChild(h('p', { cls: 'muted', text: '本職類在本病人現有疾病沒有已核准的工作卡。' }));
    K.cards.forEach(function (k) {
      var art = h('article', { cls: 'kit-card' }, h('h3', { text: k.disease_name + '｜' + k.triage + (k.signed ? '' : '（內容未核准）') }));
      [['先問', k.ask], ['先做', k.act], ['轉介', k.refer], ['追蹤升級', k.follow]].forEach(function (x) { if (x[1]) art.appendChild(h('p', null, h('b', { text: x[0] + '：' }), h('span', { text: x[1] }))); });
      if (k.say_items.length) art.appendChild(h('p', { cls: 'hint', text: '怎麼說：用已核准的衛教項目——' + k.say_items.map(function (x) { return x.title; }).join('；') }));
      var cl = kitClaimList(K, k.claims); if (cl) art.appendChild(h('details', null, h('summary', { text: '依據（臨床事實 ' + k.claims.length + '）' }), cl));
      box.appendChild(art);
    });
    if (K.specs && K.specs.length) box.appendChild(h('details', null, h('summary', { text: '共病衝突規格（' + K.specs.length + '）' }), h('ul', null, K.specs.map(function (x) {
      return h('li', null, h('b', { text: x.title }), h('div', { text: '衝突：' + x.conflict }), h('div', { text: '替代：' + x.alt }), h('div', { text: '責任：' + x.owner + '｜例外：' + x.exception }), h('div', { cls: 'hint', text: '需要資料：' + x.need }));
    }))));
    if (K.l3) { var all = (K.claims || []).map(function (c) { return c.id; }); var cl = kitClaimList(K, all); if (cl) box.appendChild(h('details', null, h('summary', { text: '臨床事實（本病人疾病，全部 ' + all.length + '）' }), cl)); }
    return box;
  }
  /** 承接：病人的提問待回覆／待告知（14.2 閉環） */
  function pqOpenPanel(b) {
    var L = (b.pq && b.pq.open) || [], R = (b.pq && b.pq.recent) || []; if (!L.length && !R.length) return null;
    var name = function (x) { var q = b.pq.qa.filter(function (y) { return y.qa_id === x.qa_id; })[0]; var t = b.pq.qtypes.filter(function (y) { return y.id === x.qtype; })[0]; return (q && q.ask) || ((t ? t.name : x.qtype) + (x.text ? '：' + x.text : '')); };
    var recentBox = R.length ? h('div', null, h('ul', null, R.map(function (x) { return h('li', null, name(x), h('span', { cls: 'muted', text: '｜' + x.by_role_name + ' ' + String(x.ts).slice(5, 10) + ' ' + x.status })); }))) : null;
    if (!L.length) return h('details', { cls: 'panel pq-recent' }, h('summary', { text: '病人上次問過（' + R.length + '）' }), recentBox);
    return h('section', { cls: 'panel pq-open', 'aria-label': '病人的提問' }, h('h2', { text: '病人問過、還沒告訴病人（' + L.length + '）' }), h('ul', { cls: 'list' }, L.map(function (x) {
      var li = h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: name(x) }),
        x.reply ? h('p', { cls: 'pq-reply-text' }, h('b', { text: x.reply.role + (x.reply.name ? ' ' + x.reply.name : '') + ' 回覆：' }), x.reply.text) : null,
        h('div', { cls: 'muted', text: (x.status === '已回覆' ? '請告訴病人' : '等' + roleNm(x.owner) + '回覆') + (x.due ? '｜期限 ' + x.due.slice(5) : '') + (x.overdue ? '（已逾期）' : '') })));
      if (x.status === '已回覆') { var tbv = { v: '' }; li.appendChild(h('div', { cls: 'pq-told' }, h('span', { cls: 'lab', text: '告知後請病人說一次（選填）' }), liveSeg(['通過', '提示後通過', '未通過'], '', function (v) { tbv.v = tbv.v === v ? '' : v; }, '', '告知後教回（選填）'),
        h('button', { cls: 'btn', type: 'button', text: '已告訴病人', on: { click: function () { api('pq.told', { personId: b.person.person_id, pqId: x.pq_id, how: b.setting === '電訪' ? '電話' : '當面', tb: tbv.v }).then(function () { b.pq.open = b.pq.open.filter(function (y) { return y.pq_id !== x.pq_id; }); toast('已結案'); renderPatient($('app')); }).catch(fail); } } }))); }
      return li;
    })), recentBox ? h('details', null, h('summary', { text: '病人上次問過' }), recentBox) : null);
  }
  function renderPatientView(app, b, d) {
    document.body.classList.add('pview');
    var back = h('button', { cls: 'btn', type: 'button', id: 'pvoff', text: '回到專業畫面', on: { click: function () { S.pview = null; document.body.classList.remove('pview'); renderPatient($('app')); window.scrollTo(0, S.pvScroll || 0); } } });
    var wrap = h('section', { cls: 'pv', 'aria-label': '給病人看的畫面' }, h('div', { cls: 'pv-head' }, h('h1', { text: (b.person.title || '') + '，今天的重點' }), back));
    var cards = b.queue.filter(function (q) { return q.item_id !== 'HELP' && q.patient && (q.patient.core || q.patient.keypoint || q.patient.text); });
    // VR12-8：說明句以重點開頭時只印一次
    if (cards.length) wrap.appendChild(h('ol', { cls: 'pv-list' }, cards.map(function (q) {
      var core = q.patient.core || q.patient.keypoint, txt = q.patient.text || '';
      var lead = String(core).replace(/[。！？]$/, '').slice(0, 6);
      if (txt && lead && txt.indexOf(lead) === 0) return h('li', null, h('p', { cls: 'pv-core', text: txt }));
      return h('li', null, h('p', { cls: 'pv-core', text: core }), txt ? h('p', { text: txt }) : null);
    })));
    var H = b.pq && (b.pq.pv_help || b.pq.help);
    if (H && (H.l119.length || H.led.length || H.lday.length)) wrap.appendChild(h('div', { cls: 'pv-help' }, h('h2', { text: '什麼時候要求助' }), helpTiers(H, b.pq.heads, false)));
    var asked = (S.pqAnswered || []).filter(function (x) { return x.pid === b.person.person_id && x.answer; });
    if (asked.length) wrap.appendChild(h('div', { cls: 'pv-asked' }, h('h2', { text: '您問的問題' }), h('ul', null, asked.map(function (x) { return h('li', { text: x.answer }); }))));
    app.appendChild(wrap);
    setBar(null);
    back.focus();
  }

  /* ---------- B35 院內問答庫（醫事端參考；上架須來源已查證、依據定位、作者具名、同職類另一人複閱、到期重審） ---------- */
  function faqPanel(gid) {
    var box = h('section', { cls: 'panel faq', 'aria-labelledby': 'faqh' }, h('h2', { id: 'faqh', text: '院內問答庫（本職類）' }), h('p', { cls: 'muted', text: '醫事端參考，不會印在單張、不會出現在給病人看的畫面。上架須來源已查證並寫明依據位置，再由同職類另一位同仁複閱；到期須重審。' }));
    var body = h('div'); box.appendChild(body);
    api('faq.list', {}).then(function (F) {
      var v = { src: '' };
      var q = h('input', { type: 'text', id: 'faqq', maxlength: '80', 'aria-label': '問題' });
      var a = h('textarea', { id: 'faqa', maxlength: '300', 'aria-label': '回答' });
      var loc = h('input', { type: 'text', id: 'faql', maxlength: '120', 'aria-label': '依據定位（章節、條號或頁碼）' });
      var sel = h('select', { 'aria-label': '來源（已查證）', on: { change: function () { v.src = sel.value; } } }, [h('option', { value: '', text: '選來源（只列已查證）' })].concat(F.sources.map(function (x) { return h('option', { value: x.id, text: x.label }); })));
      body.appendChild(h('h3', { text: '新增問答' }));
      body.appendChild(h('div', { cls: 'field' }, h('label', { for: 'faqq', text: '問題（80 字內，不談個別病人）' }), q));
      body.appendChild(h('div', { cls: 'field' }, h('label', { for: 'faqa', text: '回答（300 字內）' }), a));
      body.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '來源' }), sel));
      body.appendChild(h('div', { cls: 'field' }, h('label', { for: 'faql', text: '依據定位' }), loc));
      body.appendChild(h('button', { cls: 'btn', type: 'button', text: '送同職類複閱', on: { click: function () { api('faq.propose', { q: q.value, a: a.value, sourceIds: v.src, loc: loc.value, fromMsg: S.faqFrom || '' }).then(function () { toast('已送複閱'); S.faqFrom = null; clear(body); box.replaceWith(faqPanel(gid)); }).catch(fail); } } }));
      if (F.pending.length) { body.appendChild(h('h3', { text: '待複閱（' + F.pending.length + '）' })); body.appendChild(h('ul', { cls: 'list' }, F.pending.map(function (x) {
        return h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: x.q }), h('div', { text: x.a }), h('div', { cls: 'muted', text: x.author + '｜' + x.sources.map(function (s) { return s.label; }).join('、') + '｜' + x.loc })),
          x.mine ? h('span', { cls: 'muted', text: '等他人複閱' }) : h('div', { cls: 'inline' }, ['上架', '退回'].map(function (act) { return h('button', { cls: 'btn quiet', type: 'button', text: act === '上架' ? '複閱通過，上架' : '退回', on: { click: function () { api('faq.review', { faqId: x.id, action: act }).then(function () { toast(act === '上架' ? '已上架' : '已退回'); box.replaceWith(faqPanel(gid)); }).catch(fail); } } }); })));
      }))); }
      var mineLive = F.live.filter(function (x) { return x.role === S.me.acting_role; });
      if (mineLive.length) { body.appendChild(h('h3', { text: '已上架（' + mineLive.length + '）' })); body.appendChild(h('ul', { cls: 'list' }, mineLive.map(function (x) { return h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: x.q }), h('div', { text: x.a }), h('div', { cls: 'muted', text: '作者 ' + x.author + '、複閱 ' + x.reviewer + '｜到期 ' + x.expires }))); }))); }
    }).catch(function (e) { fail(e, body); });
    return box;
  }
  /* ---------- UXA3 暫停與繼續（14.20）：草稿存本機，綁使用者、病人；只存點選與項目代碼，不存自由文字與識別資料 ---------- */
  var DRAFT_PREFIX = 'careteam.draft.';
  var DRAFT_KEEP = ['ack', 'events', 'learnerIds', 'communication', 'time', 'curiosity', 'overrideReason', 'nextRoles', 'readmitBarrier', 'notDone', 'certainty', 'continuity'];
  function draftKey(pid) { return S.me ? DRAFT_PREFIX + S.me.person_id + '.' + S.me.acting_role + '.' + pid : ''; }
  function store() { try { var ls = window.localStorage; var k = '__ct_t'; ls.setItem(k, '1'); ls.removeItem(k); return ls; } catch (e) { return null; } }
  function saveDraft() {
    var d = S.draft, ls = store(), k = d && draftKey(d.pid); if (!ls || !k || !d.dirty || d.resume) return;
    var o = { v: 1, ts: Date.now(), openTs: d.openTs, clicks: d.clicks, idemKey: d.idemKey, results: {}, commits: Object.keys(d.commits), deliverSkip: Object.keys(d.deliverSkip), refer: (d.refer || []).map(function (r) { return { to_role: r.to_role, reason: r.reason }; }), elements: {} };
    DRAFT_KEEP.forEach(function (f) { o[f] = d[f]; });
    Object.keys(d.results).forEach(function (x) { var r = d.results[x]; if (r.tb_result) o.results[x] = { learner_id: r.learner_id, item_id: r.item_id, variant_id: r.variant_id, tb_result: r.tb_result, tb_mode: r.tb_mode, barrier: r.barrier || '', direct: r.direct }; });
    Object.keys(d.elements).forEach(function (x) { var v = d.elements[x]; o.elements[x] = v && typeof v === 'object' ? String(v.value) : String(v); });
    try { ls.setItem(k, JSON.stringify(o)); } catch (e) { /* 儲存空間不可用時不影響送出 */ }
  }
  function loadDraft(pid) {
    var ls = store(), k = draftKey(pid); if (!ls || !k) return null;
    try { var o = JSON.parse(ls.getItem(k) || 'null'); if (!o || o.v !== 1) return null; if (Date.now() - o.ts > ((S.info && S.info.session_hours) || 12) * 3600000) { ls.removeItem(k); return null; } return o; } catch (e) { return null; }
  }
  function dropDraft(pid) { var ls = store(), k = draftKey(pid); if (ls && k) try { ls.removeItem(k); } catch (e) { } }
  /** V12-14：登入時清掉不屬於本人或逾時的草稿 */
  function sweepDrafts() { var ls = store(); if (!ls || !S.me) return; var mine = DRAFT_PREFIX + S.me.person_id + '.', maxMs = ((S.info && S.info.session_hours) || 12) * 3600000; try { Object.keys(ls).filter(function (k) { return k.indexOf(DRAFT_PREFIX) === 0; }).forEach(function (k) { var o = null; try { o = JSON.parse(ls.getItem(k)); } catch (e) { } if (k.indexOf(mine) !== 0 || !o || Date.now() - o.ts > maxMs) ls.removeItem(k); }); } catch (e) { } }
  function dropAllDrafts() { var ls = store(); if (!ls) return; try { Object.keys(ls).filter(function (k) { return k.indexOf(DRAFT_PREFIX) === 0; }).forEach(function (k) { ls.removeItem(k); }); } catch (e) { } }
  /** 把本機草稿套回目前名單：名單已變者保留仍在名單上的結果，回報被略過的數目 */
  function restoreDraft(b, o) {
    var d = newDraft(b); var keys = {}; b.queue.concat(b.alternatives || []).forEach(function (q) { keys[q.learner_id + '|' + q.item_id] = q; });
    var dropped = 0;
    DRAFT_KEEP.forEach(function (f) { if (o[f] !== undefined) d[f] = o[f]; });
    d.openTs = o.openTs || d.openTs; d.clicks = o.clicks || 0; d.idemKey = o.idemKey || d.idemKey; d.dirty = true;
    Object.keys(o.results || {}).forEach(function (k) { if (keys[k]) d.results[k] = o.results[k]; else dropped++; });
    (o.commits || []).forEach(function (k) { var q = keys[k]; if (q && q.variant && q.variant.commit) d.commits[k] = { learner_id: q.learner_id, item_id: q.item_id, text: q.variant.commit }; });
    (o.deliverSkip || []).forEach(function (k) { d.deliverSkip[k] = 1; });
    d.refer = o.refer || []; d.elements = o.elements || {};
    d.restored = { dropped: dropped };
    return d;
  }
  /* ---------- D49 收件匣輪詢（無推播；網頁開著時每 60 秒） ---------- */
  var pollTimer = null;
  function setBadge(href, n, label) { var b = document.querySelector('[data-badge="' + href + '"]'); if (!b) return; b.hidden = !n; b.textContent = n ? String(n) : ''; b.setAttribute('aria-label', n ? n + ' ' + label : ''); }
  function pollInbox() {
    if (!S.session || document.hidden) return;
    api('msg.inbox', {}).then(function (d) { S.inbox = d; setBadge('#/', d.need_reply.length, '則留言待回'); setBadge('#/groups', d.groups_unread, '則群組未讀'); }).catch(function () {});
  }
  function startPoll() { if (pollTimer) return; pollInbox(); pollTimer = setInterval(pollInbox, (CFG.pollSeconds || 60) * 1000); }
  /* ---------- D49 病人對話串（側欄） ---------- */
  /** VR11-10：承接區「給我的留言」與對話串同一狀態：在對話串處理後同步本機資料 */
  function syncForMe(id, st) { var b = S.b; if (!b || !b.messages_for_me) return; b.messages_for_me.forEach(function (m) { if (m.id === id) { m.taken = st; m.need_reply = false; } }); }
  function threadPanel(b) {
    var pid = b.person.person_id, box = h('div', { cls: 'panel thread', id: 'thread' });
    var list = h('div', { cls: 'tl', role: 'log', 'aria-live': 'polite', 'aria-label': '對話串' });
    var v = S.threadDraft && S.threadDraft.pid === pid ? S.threadDraft : (S.threadDraft = { pid: pid, type: '知會', toRole: null, text: '', ref: null });
    box.appendChild(h('h3', { text: '對話串' }));
    box.appendChild(h('p', { cls: 'hint', text: '急事請直接打電話。不要寫姓名與病歷號；留言不會寫進病歷。' }));
    box.appendChild(list);
    var comp = h('div', { cls: 'composer' });
    box.appendChild(comp);
    var draw = function (d) {
      S.thread = d; S.threadAt = Date.now();
      clear(list);
      if (!d.items.length) list.appendChild(h('p', { cls: 'muted', text: '還沒有留言。' }));
      // UX11-5：系統事件與系統訊息收進可展開的「系統紀錄」，人寫的留言不被淹沒
      var evs = d.items.slice(-40).filter(function (x) { return x.kind === 'event' || x.type === '系統'; });
      if (evs.length) list.appendChild(h('details', { cls: 'evlog' }, h('summary', { text: '系統紀錄（' + evs.length + '）' }), h('ul', null, evs.map(function (x) { return h('li', { cls: 'muted', text: String(x.ts).slice(5, 16).replace('T', ' ') + '　' + (x.kind === 'event' ? x.text : x.text) }); }))));
      d.items.slice(-40).forEach(function (x) {
        if (x.kind === 'event' || x.type === '系統') return;
        var cls = 'bub' + (x.mine ? ' mine' : '') + (x.type === '系統' ? ' sys' : '') + (x.unread ? ' unread' : '') + (x.recalled ? ' recalled' : '');
        var meta = h('span', null, h('span', { cls: 'nw', text: x.mine ? x.from_role + '（我）' : x.from_role }), x.mine || !x.from_name ? '' : h('span', { cls: 'nw', text: ' ' + x.from_name }), x.to_role_name ? h('span', { cls: 'nw', text: ' → ' + (x.to_role_name === x.from_role ? '本職類' : x.to_role_name) }) : null, '｜' + String(x.ts).slice(5, 16).replace('T', ' '));
        var bub = h('div', { cls: cls }, h('div', { cls: 'meta' }, h('span', { cls: 'chip', text: x.recalled ? '已收回' : x.type }), x.need_reply && !x.recalled ? h('span', { cls: 'chip ' + (x.closed || x.converted ? 'ok' : 'warn'), text: x.converted ? '已承接' : x.closed ? '已回' : '待回' }) : null, ' ', meta), x.ref ? h('div', { cls: 'ref', text: '引用：' + (x.ref.label || x.ref.key) }) : null, h('div', { cls: 'txt', text: x.recalled ? '（已收回）' : x.text }));
        if (x.status) bub.appendChild(h('div', { cls: 'muted', text: x.status }));
        if (!x.mine && x.type === '請協助' && !x.closed && !x.converted && (!x.to_role || x.to_role === S.me.acting_role)) {
          var dd = h('input', { type: 'date', 'aria-label': '承接期限' }), why = h('div');
          bub.appendChild(h('div', { cls: 'inline' }, dd, h('button', { cls: 'btn quiet', type: 'button', text: '承接', on: { click: function () { api('msg.respond', { personId: pid, msgId: x.id, action: '承接', due: dd.value }).then(function (nd) { syncForMe(x.id, '已承接'); S.thread = nd; S.threadAt = Date.now(); renderPatient($('app')); }).catch(fail); } } }),
            h('button', { cls: 'btn quiet', type: 'button', text: '退回', on: { click: function () { clear(why).appendChild(seg(S.info.enums.HANDOFF_REJECT, null, function (r) { api('msg.respond', { personId: pid, msgId: x.id, action: '退回', reason: r }).then(function (nd) { syncForMe(x.id, '已退回'); S.thread = nd; S.threadAt = Date.now(); renderPatient($('app')); }).catch(fail); }, '', '退回原因')); } } })), why);
        }
        if (!x.mine && x.need_reply && !x.closed) bub.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '回覆', on: { click: function () { v.replyTo = x.id; v.type = '回報完成'; v.toRole = x.from_role_id; drawComp(d); comp.querySelector('textarea').focus(); } } }));
        if (x.mine && !x.recalled && x.type !== '系統') bub.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '收回', on: { click: function () { api('msg.recall', { personId: pid, msgId: x.id }).then(draw).catch(fail); } } }));
        list.appendChild(bub);
      });
      list.scrollTop = list.scrollHeight;
      drawComp(d);
      if (d.unread) { d.unread = 0; api('msg.read', { personId: pid }).then(pollInbox).catch(function () {}); }
    };
    var drawComp = function (d) {
      clear(comp);
      if (v.ref) comp.appendChild(h('div', { cls: 'inline' }, h('span', { cls: 'chip new', text: '引用：' + (v.ref.label || v.ref.key) }), h('button', { cls: 'btn quiet', type: 'button', text: '取消引用', on: { click: function () { v.ref = null; drawComp(d); } } })));
      if (v.replyTo) comp.appendChild(h('div', { cls: 'inline' }, h('span', { cls: 'chip ok', text: '回覆中' }), h('button', { cls: 'btn quiet', type: 'button', text: '取消回覆', on: { click: function () { v.replyTo = ''; v.type = '知會'; v.toRole = null; drawComp(d); } } })));
      comp.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '類型' }), seg((d.types || []).filter(function (t) { return t !== '回報完成' || v.replyTo; }), v.type, function (t) { v.type = t; drawComp(d); }, '', '留言類型')));
      // UX11-9：「給誰」沒有預設，必選；選「全部職類」才廣播
      var to = h('select', { id: 'msgto', required: true, on: { change: function () { v.toRole = to.value || null; } } }, [h('option', { value: '', text: '請選擇', selected: !v.toRole, disabled: true }), h('option', { value: 'ALL', text: '全部職類', selected: v.toRole === 'ALL' })].concat(S.info.roles.map(function (r) { return h('option', { value: r.id, selected: r.id === v.toRole, text: r.name }); })));
      comp.appendChild(h('div', { cls: 'field' }, h('label', { for: 'msgto', text: '給誰' }), to));
      var ta = h('textarea', { id: 'msgtxt', maxlength: '200', on: { input: function () { v.text = ta.value; } } }); ta.value = v.text;
      comp.appendChild(h('div', { cls: 'field' }, h('label', { for: 'msgtxt', text: '留言（200 字內）' }), ta));
      if (d.templates && d.templates.length) comp.appendChild(h('div', { cls: 'chips' }, d.templates.map(function (t) { return h('button', { cls: 'btn quiet tpl', type: 'button', text: t, on: { click: function () { v.text = t; ta.value = t; } } }); })));
      comp.appendChild(h('button', { cls: 'btn', type: 'button', text: '送出留言', on: { click: function () {
        if (!v.toRole) { toast('請先選「給誰」'); to.focus(); return; }
        api('msg.send', { personId: pid, type: v.type, toRole: v.toRole === 'ALL' ? '' : v.toRole, text: v.text, ref: v.ref, replyTo: v.replyTo || '' }).then(function (nd) { v.text = ''; v.ref = null; v.replyTo = ''; v.type = '知會'; v.toRole = null; draw(nd); toast('已送出'); }).catch(fail);
      } } }));
    };
    // 床邊每次點選都會重繪：對話串 60 秒內用快取，送出、回覆、收回時才重取
    if (S.thread && S.thread.person_id === pid && Date.now() - (S.threadAt || 0) < 60000) draw(S.thread);
    else api('msg.list', { personId: pid }).then(function (d) { S.thread = d; S.threadAt = Date.now(); draw(d); }).catch(function (e) { fail(e, list); });
    return box;
  }
  /** 從照護物件就地留言：帶引用並捲到對話串 */
  function leaveMsg(ref) { if (!S.threadDraft) return; S.threadDraft.ref = ref; var t = $('thread'); if (t) { renderPatient($('app')); setTimeout(function () { var th = $('thread'); if (th) { th.scrollIntoView({ block: 'start' }); var x = th.querySelector('textarea'); if (x) x.focus(); } }, 50); } }
  function roundIndex(pid) { if (!S.round) return -1; for (var i = 0; i < S.round.list.length; i++) if (S.round.list[i].pid === pid) return i; return -1; }
  function roundNextButtons(pid) {
    var i = roundIndex(pid); if (i < 0) return [];
    var nx = S.round.list[i + 1];
    if (nx) return [h('button', { cls: 'btn', type: 'button', 'data-read': '1', text: '下一位：' + (nx.title || '') + ' ' + nx.tail, on: { click: function () { S.round.i = i + 1; S.b = null; S.draft = null; S.handout = null; location.hash = '#/p/' + nx.pid; } } })];
    return [h('a', { cls: 'btn', href: '#/notes', text: '巡房完成：到本班病歷', on: { click: function () { S.round = null; } } })];
  }
  var recomputeTimer = null;
  function recompute() {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(function () {
      var d = S.draft, b = S.b;
      var draftEls = {}; Object.keys(d.elements).forEach(function (k) { draftEls[k] = d.elements[k]; });
      api('recomputeQueue', { personId: b.person.person_id, setting: b.setting, learnerIds: d.learnerIds, draftElements: draftEls, draftEvents: d.events, curiosity: d.curiosity, time: d.time, primary: d.primary, wanted: d.wanted, certainty: d.certainty })
        .then(function (nb) { S.b = nb; renderPatient($('app')); }).catch(fail);
    }, 350);
  }
  function renderPatient(app) {
    var b = S.b, d = S.draft; clear(app);
    if (S.pview && S.pview === b.person.person_id) return renderPatientView(app, b, d);
    if (S.me.novice) document.body.classList.add('novice');
    var ri = roundIndex(b.person.person_id);
    if (ri >= 0) app.appendChild(h('p', { cls: 'alert info round-progress', role: 'status', text: '巡房：第 ' + (ri + 1) + ' 位／共 ' + S.round.list.length + ' 位' + (b.bed && b.bed.value ? '｜' + b.bed.value + '床' : '') }));
    var pqo = pqOutBanner(b.person.person_id); if (pqo) app.appendChild(pqo);
    app.appendChild(ptitle(b));
    app.appendChild(h('div', { cls: 'pv-toggle' }, h('button', { cls: 'btn quiet', type: 'button', id: 'pvon', text: '給病人看', 'aria-label': '切換到給病人看的畫面', on: { click: function () { S.pview = b.person.person_id; S.pvScroll = window.scrollY; renderPatient($('app')); window.scrollTo(0, 0); } } })));
    if (d.resume) app.appendChild(h('div', { cls: 'alert info resume', role: 'region', 'aria-label': '未送出的接觸' },
      h('span', { text: '有一筆上次未送出的接觸（' + new Date(d.resume.ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) + '）。要繼續嗎？' }),
      h('button', { cls: 'btn', type: 'button', text: '繼續上次', on: { click: function () { S.draft = restoreDraft(b, d.resume); recompute(); renderPatient($('app')); } } }),
      h('button', { cls: 'btn quiet', type: 'button', text: '重新開始', on: { click: function () { dropDraft(b.person.person_id); delete d.resume; renderPatient($('app')); } } })));
    if (d.restored) app.appendChild(h('p', { cls: 'alert ' + (d.restored.dropped ? 'mid' : 'info'), role: 'status', text: d.restored.dropped ? '已接續上次的紀錄。名單已由他人更新，' + d.restored.dropped + ' 項不在目前名單上，已略過；其餘保留。' : '已接續上次的紀錄。' }));
    var grid = h('div', { cls: 'grid2' }); app.appendChild(grid);
    var main = h('div'), side = h('aside'); grid.appendChild(main); grid.appendChild(side);
    var pqp = pqOpenPanel(b); if (pqp) main.appendChild(pqp);
    var kp = kitPanel(b); if (kp) side.appendChild(kp);
    var n = 0;
    var ackDone = d.ack.length >= 4;
    if (b.handover) main.appendChild(stepHandover(++n, b, d));
    main.appendChild(stepAssess(++n, b, d, !ackDone));
    if (b.continuation) main.appendChild(h('p', { cls: 'alert info', role: 'note', text: '延續前一班：' + b.continuation.role + ' ' + String(b.continuation.ts).slice(11, 16) + ' 已完成指導；本班只做確認與新變化' + (b.continuation.skipped ? '（略過 ' + b.continuation.skipped + ' 項前一班已通過者）' : '') + '。' }));
    main.appendChild(stepFocus(++n, b, d, !ackDone));
    if (b.deliver && b.deliver.length) main.appendChild(stepDeliver(++n, b, d, !ackDone));
    main.appendChild(stepWrap(++n, b, d, !ackDone));
    renderSide(side, b, d);
    renderSubmitBar(b, d);
    saveDraft();
  }
  function stepHandover(n, b, d) {
    var H = b.handover; if (!d.ackStart) d.ackStart = Date.now();
    var acked = function (k) { return d.ack.indexOf(k) >= 0; };
    var ack = function (k) { if (!acked(k)) d.ack.push(k); touch(); if (d.ack.length >= 4) d.ackSeconds = Math.round((Date.now() - d.ackStart) / 1000); renderPatient($('app')); };
    var row = function (k, title, body) { return h('div', { cls: 'row' + (acked(k) ? ' acked' : '') }, h('div', { cls: 'k', text: k }), h('div', null, h('div', { style: { fontWeight: '700' }, text: title }), body), acked(k) ? h('span', { cls: 'chip ok', text: '已知道' }) : h('button', { cls: 'btn quiet', type: 'button', text: '已知道', on: { click: function () { ack(k); } } })); };
    var li = function (arr) { return arr && arr.length ? h('ul', null, arr.map(function (x) { return h('li', { text: x }); })) : h('div', { cls: 'muted', text: '無' }); };
    var m = H.B.mastery;
    return h('section', { cls: 'step' + (d.ack.length >= 4 ? ' done' : '') }, h('span', { cls: 'n', text: n }), h('h2', { text: '承接' }),
      h('p', { cls: 'muted', text: '由紀錄自動整理；四段都看過才能開始評估。' }),
      d.ack.length < 4 ? h('button', { cls: 'btn quiet', type: 'button', text: '四段都看過了', on: { click: function () { ['S', 'B', 'A', 'R'].forEach(function (k) { if (!acked(k)) d.ack.push(k); }); touch(); d.ackSeconds = Math.round((Date.now() - d.ackStart) / 1000); if ((b.messages_for_me || []).length) api('msg.read', { personId: b.person.person_id }).then(pollInbox).catch(function () {}); renderPatient($('app')); } } }) : null,
      // D49：承接第五段「給我或本職類的留言」，未讀與需回覆者列最上
      (b.messages_for_me || []).length ? h('div', { cls: 'msg-for-me', role: 'region', 'aria-label': '給我的留言' }, h('h3', { text: '給我或本職類的留言（' + b.messages_for_me.length + '）' }), h('ul', null, b.messages_for_me.map(function (m) { return h('li', null, h('span', { cls: 'chip ' + (m.need_reply ? 'warn' : '') , text: m.type + (m.taken ? '・' + m.taken : (m.need_reply ? '・待回' : '')) }), ' ' + m.from + '：' + m.text + (m.ref ? '（' + (m.ref.label || m.ref.key) + '）' : '')); })), h('p', { cls: 'hint', text: '需回覆者請在側欄對話串回覆；送出時會再提醒。' })) : null,
      h('div', { cls: 'sbar' },
        row('S', '狀況', h('div', { text: H.S.diseases.join('、') + '｜' + H.S.setting + '｜' + H.S.stage + (H.S.last ? '｜上次 ' + H.S.last.date + ' ' + H.S.last.role + ' ' + H.S.last.name : '') })),
        row('B', '掌握與面向', h('div', null, h('div', { text: '未知 ' + m[0] + '｜知道 ' + m[1] + '｜會做 ' + m[2] + '｜持續做到 ' + m[3] }), H.B.lens.length ? h('div', { cls: 'muted', text: '面向涵蓋：' + H.B.lens.map(function (x) { return x.role + ' ' + x.n; }).join('、') }) : null)),
        row('A', '上次結果與承諾', h('div', null, H.A.fails.length ? h('div', null, h('b', { text: '未通過或需提示：' }), li(H.A.fails.map(function (f) { return f.title + '（' + f.result + '）'; }))) : null, h('div', null, h('b', { text: '上次承諾：' }), li(H.A.commits)), H.A.conflicts.length ? h('div', { cls: 'alert mid', text: '待裁決：' + H.A.conflicts.join('；') }) : null, H.A.note ? h('div', { text: '給下一位：「' + H.A.note + '」' }) : null, H.A.suspect.length ? h('div', { cls: 'muted', text: '疑似疾病待確認：' + H.A.suspect.map(dzName).join('、') }) : null)),
        row('R', '建議', h('div', null, li(H.R.focus), H.R.others.length ? h('div', { cls: 'muted', text: '其他職類待談：' + H.R.others.join('、') }) : null, H.R.referrals.length ? h('div', { cls: 'muted', text: '待轉介：' + H.R.referrals.join('、') }) : null, h('div', { cls: 'muted', text: '待教 ' + H.R.backlog.total + ' 項，依目前上限約需 ' + H.R.backlog.est_encounters + ' 次' })))));
  }
  function stepAssess(n, b, d, locked) {
    var s = h('section', { cls: 'step' + (locked ? ' locked' : ''), 'aria-disabled': String(locked) }, h('span', { cls: 'n', text: n }), h('h2', { text: '評估' }));
    var set = function (k, v) { d[k] = v; touch(); recompute(); };
    // D45 M2：後續確定性（預設由場域帶出，一鍵可改）
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '還會再見到這位病人嗎' }), seg(S.info.enums.CERTAINTY, d.certainty, function (v) { set('certainty', v); }, '', '後續確定性'),
      h('div', { cls: 'hint', text: d.certainty === '已約下次' ? '其餘主題列入交付，下次先請病人說說看。' : '系統會把本職類該講的全部交付並印進單張；生存必需未教回者自動開保底待辦。' })));
    // 13.8 床號：屬於這一次住院
    if (b.bed && b.bed.show) {
      var bed = h('input', { type: 'text', id: 'bedno', maxlength: '8', value: d.bed, autocomplete: 'off', on: { input: function () { d.bed = bed.value.trim(); } } });
      s.appendChild(h('div', { cls: 'field' }, h('label', { for: 'bedno', text: '床號（選填）' }), bed, h('div', { cls: 'hint', text: b.bed.readmit ? '再次入院，請重新填床號。' : (b.bed.carried ? '沿用本次住院的床號；轉床請直接改。' : '只填床號，不要填姓名或病歷號。') })));
    }
    if (!b.first) s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '自上次以來的變化' }), seg(['無'].concat(S.info.enums.EVENTS), d.events.length ? d.events : ['無'], function (v) { if (v === '無') d.events = []; else { var i = d.events.indexOf(v); if (i >= 0) d.events.splice(i, 1); else d.events.push(v); } touch(); recompute(); renderPatient($('app')); }, '', '變化')));
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '誰在場' }), seg(b.learners.map(function (l) { return { v: l.id, t: l.type + (l.title ? ' ' + l.title : '') + (l.literacy === '低' ? '（低識能）' : '') }; }), d.learnerIds, function (id) { var i = d.learnerIds.indexOf(id); if (i >= 0 && d.learnerIds.length > 1) d.learnerIds.splice(i, 1); else if (i < 0) d.learnerIds.push(id); touch(); recompute(); }, '', '在場學習者')));
    // V25：溝通與可用時間各自一列，標籤與按鈕左緣對齊
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '溝通' }), seg(S.info.enums.COMMUNICATION, d.communication, function (v) { d.communication = v; touch(); renderPatient($('app')); }, '', '溝通')));
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '可用時間' }), seg(S.info.enums.TIME, d.time, function (v) { set('time', v); }, '', '時間')));
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '想知道多少' }), seg(S.info.enums.CURIOSITY, d.curiosity, function (v) { set('curiosity', v); }, '', '求知慾'), h('div', { cls: 'hint', text: '安全相關內容不會因此減少。' })));
    var conf = b.diseases.filter(function (x) { return x.status === '已確認' && x.level !== '共病標記'; });
    if (conf.length > 1) s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '這次主要問題' }), seg(conf.map(function (x) { return { v: x.id, t: x.name }; }), d.primary, function (v) { set('primary', v); }, '', '主要問題')));
    var topics = uniqTopics(b);
    if (topics.length) s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '今天最想談（選填）' }), seg(topics, d.wanted, function (v) { set('wanted', d.wanted === v ? '' : v); }, '', '最想談')));
    if (b.readmit_question) s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '回家後沒做到的原因' }), seg(S.info.enums.READMIT_BARRIER, d.readmitBarrier, function (v) { d.readmitBarrier = v; touch(); renderPatient($('app')); }, '', '再入院障礙')));
    b.pending_commits.forEach(function (c) {
      var k = c.learner_id + '|' + c.item_id, f = d.followups[k] || {};
      s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '上次承諾：「' + c.text + '」做到了嗎' }), seg(S.info.enums.COMMIT_STATUS, f.status, function (v) { d.followups[k] = { learner_id: c.learner_id, item_id: c.item_id, status: v, barrier: f.barrier }; touch(); renderPatient($('app')); }, '', '承諾追問'),
        f.status === '沒做' ? seg(S.info.enums.BARRIER, f.barrier, function (v) { f.barrier = v; d.followups[k] = Object.assign({ learner_id: c.learner_id, item_id: c.item_id, status: '沒做' }, f, { barrier: v }); renderPatient($('app')); }, '', '障礙') : null));
    });
    var mine = b.elements_bedside.filter(function (e) { return e.mine && (e.due || d.elements[e.id] !== undefined); });
    mine.forEach(function (e) { s.appendChild(elementField(e, d.elements, function () { touch(); recompute(); })); });
    var others = b.elements_bedside.filter(function (e) { return !e.mine && e.current; });
    if (others.length) s.appendChild(h('details', null, h('summary', { text: '其他職類填的評估（' + others.length + '）' }), h('ul', null, others.map(function (e) { return h('li', null, e.name + '：' + e.current.value + '（' + roleNm(e.current.by_role) + '）', h('button', { cls: 'btn quiet', type: 'button', text: '我觀察到不同', on: { click: function () { var note = prompt('您觀察到什麼不同？（80 字內）'); if (note) api('disagree', { personId: b.person.person_id, elementId: e.id, note: note }).then(function () { toast('已送給' + e.filler.join('、') + '處理'); }).catch(fail); } } })); }))));
    return s;
  }
  function uniqTopics(b) { var seen = {}, out = []; b.queue.concat(b.alternatives).forEach(function (q) { if (q.topic_id && q.topic_id !== 'HELP' && !seen[q.topic_id]) { seen[q.topic_id] = 1; out.push({ v: q.topic_id, t: q.topic || q.topic_id }); } }); return out.slice(0, 8); }

  function stepFocus(n, b, d, locked) {
    var s = h('section', { cls: 'step' + (locked ? ' locked' : '') }, h('span', { cls: 'n', text: n }), h('h2', { text: '本次焦點' }));
    var info = [];
    info.push(b.stage + '｜上限 ' + b.N + ' 項（安全級另計）');
    if (b.daily.hit) info.push('今日已教 ' + b.daily.taught_today + ' 項，已達每日總量，新項目改為確認');
    if (b.deferred_safety) info.push('另有 ' + b.deferred_safety + ' 項安全級排到下次');
    if (b.out_of_scope) info.push('其他疾病待教 ' + b.out_of_scope + ' 項，可轉介');
    s.appendChild(h('p', { cls: 'muted', text: info.join('；') }));
    if (b.no_new) s.appendChild(h('p', { cls: 'alert info', text: '本次沒有新項目：做確認、給回饋、回答病人的問題即可。' }));
    if (b.backlog.split_hint) s.appendChild(h('p', { cls: 'alert mid', text: '生存必需待教 ' + b.backlog.by_grade['生存必需'] + ' 項，超過單次上限，建議用「交班」或「轉介」分給其他同仁。' }));
    var shown = b.queue.concat(d.added);
    shown.forEach(function (q) { s.appendChild(focusCard(q, b, d)); });
    if (b.alternatives.length) {
      s.appendChild(h('details', null, h('summary', { text: '加選其他項目（' + b.alternatives.length + '）' }), h('ul', { cls: 'list' }, b.alternatives.filter(function (a) { return !d.added.some(function (x) { return x.item_id === a.item_id && x.learner_id === a.learner_id; }); }).map(function (a) {
        return h('li', null, ladder(a.current_level, a.target), h('div', { cls: 'main' }, h('div', { cls: 't', text: a.core }), h('div', { cls: 'muted', text: a.grade + '｜' + a.cat + (a.reasons.length ? '｜' + a.reasons.join('、') : '') })),
          h('button', { cls: 'btn quiet', type: 'button', text: '加選', on: { click: function () { api('recomputeQueue', { personId: b.person.person_id, setting: b.setting, learnerIds: d.learnerIds, curiosity: d.curiosity, time: d.time, primary: d.primary, wanted: a.topic_id }).then(function (nb) { var full = nb.queue.concat(nb.alternatives).filter(function (x) { return x.item_id === a.item_id; })[0]; d.added.push(full && full.variant !== undefined ? full : a); touch(); renderPatient($('app')); }).catch(fail); } } }),
          a.current_level < 2 ? h('button', { cls: 'btn quiet', type: 'button', text: '直接教回', title: '病人已在別處學會：直接做教回，通過即登記，最多到「會做」', on: { click: function () { d.added.push(Object.assign({}, a, { direct: true })); touch(); renderPatient($('app')); } } }) : null);
      }))));
    }
    if (isChanged(b, d)) s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '您改選了系統建議，請點理由' }), seg(S.info.enums.OVERRIDE, d.overrideReason, function (v) { d.overrideReason = v; renderPatient($('app')); }, '', '改選理由')));
    return s;
  }
  function focusCard(q, b, d) {
    var k = q.learner_id + '|' + q.item_id, r = d.results[k] || (d.results[k] = { learner_id: q.learner_id, item_id: q.item_id, variant_id: q.variant ? q.variant.id : '', tb_result: '', tb_mode: q.tb_mode || '口述', direct: !!q.direct });
    var card = h('article', { cls: 'focus' + (q.item_id === 'HELP' ? ' help' : q.safety ? ' safety' : '') });
    var tag = q.direct ? '直接教回' : q.cat;
    card.appendChild(h('div', { cls: 'head' }, ladder(q.current_level !== undefined ? q.current_level : 0, q.target, q.teach_level), h('div', { cls: 'core', text: q.item_id === 'HELP' ? q.title : q.core }),
      h('span', { cls: 'chip ' + (q.safety ? 'risk' : (['新', '升階', '差額'].indexOf(q.cat) >= 0 ? 'new' : 'ok')), text: tag + '：教到「' + (LV[q.teach_level] || ('L' + q.teach_level)) + '」' })));
    card.appendChild(h('div', { cls: 'why', text: [q.learner, q.grade].concat(q.reasons || []).filter(Boolean).join('｜') }));
    if (q.item_id === 'HELP') {
      if (q.new_lines && q.new_lines.length && (q.current_level || 0) >= 1) card.appendChild(h('p', { cls: 'alert mid', text: '新增：' + q.new_lines.join('、') }));
      card.appendChild(h('ul', { cls: 'l119' }, q.l119.map(function (x) { return h('li', { text: x + (q.highlight.indexOf(x) >= 0 ? '' : '') }); })));
      if ((q.led || []).length) card.appendChild(h('ul', { cls: 'led' }, q.led.map(function (x) { return h('li', { text: x }); })));
      card.appendChild(h('ul', { cls: 'lday' }, q.lday.map(function (x) { return h('li', { text: x }); })));
      card.appendChild(h('p', { cls: 'muted', text: '教回時強調前 ' + q.highlight.length + ' 項；其餘印在單張。' }));
    } else {
      if (q.behavior) card.appendChild(h('div', { cls: 'pass-crit', text: '本層目標：' + q.behavior }));
      if (q.ask_first) card.appendChild(h('p', { cls: 'alert info', text: '上次已書面交付：先問教回問句。答對直接登記通過；答不出來再展開講法。' }));
      if (q.variant && q.ask_first) {
        card.appendChild(h('details', null, h('summary', { text: '答不出來時的講法：' + q.variant.keypoint }), h('div', { cls: 'text', text: q.variant.text })));
      } else if (q.variant) {
        card.appendChild(h('div', { cls: 'text' }, h('div', { style: { fontWeight: '700' }, text: q.variant.keypoint }), h('div', { text: q.variant.text })));
        if (q.variants_available && q.variants_available.length > 1) card.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '講法' }), seg(q.variants_available.map(function (v) { return { v: v.id, t: v.kind }; }), r.variant_id, function (v) { r.variant_id = v; toast('已換講法，單張會跟著換'); renderPatient($('app')); }, '', '講法')));
      } else card.appendChild(h('p', { cls: 'alert mid', text: '此層講法尚未簽核，請口頭說明。' }));
      if (q.lens) card.appendChild(h('div', { cls: 'text' }, h('b', { text: '您的職類面向：' }), q.lens.depth, h('div', { text: q.lens.text })));
      if (q.advanced) card.appendChild(h('div', { cls: 'muted', text: '進階：' + q.advanced }));
      if (q.med_card) card.appendChild(medCard(q.med_card));
      if (q.device) card.appendChild(h('div', null, h('b', { text: q.device.name + '步驟（★為關鍵）' }), h('ol', null, q.device.steps.map(function (s) { return h('li', { text: s + (q.device.critical.indexOf(s) >= 0 ? ' ★' : '') }); }))));
      if (q.proxy_script) card.appendChild(h('p', { cls: 'alert info', text: '代講講稿：' + q.proxy_script }));
    }
    // v1.4（D52）焦點卡直接掛「病人常問」最多 3 條：同項目優先，再同主題；點一下開該題答案
    var pqs = pqForItem(b, q); if (pqs.length) card.appendChild(h('div', { cls: 'pq-oft' }, h('span', { cls: 'lab', text: '病人常問' }),
      pqs.map(function (x) { return h('button', { cls: 'btn quiet pq-oft-q', type: 'button', 'data-qa': x.qa_id, text: x.ask, on: { click: function () { pqOpen(b, { qa: x }); } } }); })));
    var tbq = q.lens && q.lens.tb_question || (q.variant && q.variant.tb_question) || q.tb_question;
    card.appendChild(h('div', { cls: 'tbq', text: '教回：' + (tbq || '') }));
    if (q.pass_criteria) card.appendChild(h('div', { cls: 'pass-crit', text: '通過判準：' + q.pass_criteria }));
    card.appendChild(seg(S.info.enums.TB_RESULT, r.tb_result, function (v) { r.tb_result = v; touch(); renderPatient($('app')); renderSubmitBar(S.b, d); }, 'tb', '教回結果'));
    // UX11-14：溝通有困難時每張卡都可改用示範（Show-me）教回，並提示可請在場照顧者協助
    var commHard = d.communication && d.communication !== '無困難';
    if (q.tb_mode === '示範' || commHard) card.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '教回方式' }), seg(S.info.enums.TB_MODE, r.tb_mode, function (v) { r.tb_mode = v; renderPatient($('app')); }, '', '教回方式'), commHard && q.tb_mode !== '示範' ? h('span', { cls: 'hint', text: '溝通：' + d.communication + '。無法口述時可改請病人示範或指認，或由在場照顧者協助回答。' }) : null));
    if (r.tb_result === '未通過' || r.tb_result === '提示後通過') card.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '障礙（選填）' }), seg(S.info.enums.BARRIER, r.barrier, function (v) { r.barrier = v; renderPatient($('app')); }, '', '障礙')));
    if (q.variant && q.variant.commit && r.tb_result && r.tb_result !== '未處理') {
      var on = d.commits[k] !== undefined;
      card.appendChild(h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', minHeight: '44px' } }, h('input', { type: 'checkbox', checked: on, on: { change: function (e) { if (e.target.checked) { Object.keys(d.commits).forEach(function (x) { delete d.commits[x]; }); d.commits[k] = { learner_id: q.learner_id, item_id: q.item_id, text: q.variant.commit }; } else delete d.commits[k]; } } }), '回家做的一件事：' + q.variant.commit));
    }
    if (q.evidence) card.appendChild(h('details', { open: S.me.novice || null }, h('summary', { text: '專業依據' }),
      h('div', { text: (q.evidence.type || '') + '｜建議強度：' + (q.evidence.strength || '未分級') + (q.evidence.complete ? '' : '｜依據不完整') }),
      q.evidence.note ? h('div', { text: q.evidence.note }) : null, q.evidence.not_applicable ? h('div', { text: '不適用：' + q.evidence.not_applicable }) : null,
      h('div', null, (q.evidence.sources || []).map(function (s) { return h('div', { text: s.label + (s.verified ? '' : '【未經查證】') }); })),
      q.why ? h('div', { text: '為什麼：' + q.why }) : null));
    card.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '留言', 'aria-label': '就這一項留言', on: { click: function () { leaveMsg({ kind: q.item_id === 'HELP' ? 'item' : 'item', key: q.item_id, label: q.item_id === 'HELP' ? '什麼時候要求助' : q.core }); } } }));
    if (q.relation !== 'O' && q.cat !== '代講') card.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '說法不一致', on: { click: function () { var note = prompt('哪裡不一致？（80 字內）'); if (note) api('disagree', { personId: b.person.person_id, itemId: q.item_id, note: note }).then(function () { toast('已送主責職類'); }).catch(fail); } } }));
    return card;
  }
  function medCard(m) {
    var row = function (k, v) { return v ? h('tr', null, h('th', { text: k }), h('td', { text: v })) : null; };
    return h('table', { cls: 't kv' }, row('為什麼吃', m.why), row('怎麼吃', m.how), row('可能不舒服', m.discomfort), row('自己處理', m.selfcare), row('立即聯絡', m.urgent), row('生病時', m.sickday), row('忘記吃', m.missed), row('要避免', m.avoid), row('品項', m.meds.join('、')), m.complete ? null : h('tr', null, h('td', { colspan: '2', cls: 'err', text: '藥品卡必備欄不完整' })));
  }
  function isChanged(b, d) {
    var planned = b.queue.map(function (q) { return q.learner_id + '|' + q.item_id; });
    var actual = Object.keys(d.results).filter(function (k) { return d.results[k].tb_result && d.results[k].tb_result !== '未處理'; });
    return d.added.length > 0 || planned.some(function (k) { return d.results[k] && d.results[k].tb_result === '未處理'; }) || actual.some(function (k) { return planned.indexOf(k) < 0; });
  }
  /** D45 交付段：本職類其餘主題各一句核心訊息，印進單張「帶回家看的」，不教回、不升層級 */
  function stepDeliver(n, b, d, locked) {
    var s = h('section', { cls: 'step' + (locked ? ' locked' : '') }, h('span', { cls: 'n', text: n }), h('h2', { text: '交付（帶回家看的）' }));
    s.appendChild(h('p', { cls: 'muted', text: '以下各一句印在單張，不需教回；下次會先請病人說說看。預設全部交付，取消勾選即不印。' }));
    s.appendChild(h('p', { id: 'dl-lock', cls: 'hint', text: '生存必需不能取消：一定印在單張，逾期未確認會開保底；只交付不算安全底線完成，要教回通過才算。' }));
    var seen = {};
    b.deliver.forEach(function (x) {
      var k = x.learner_id + '|' + x.item_id; if (seen[k]) return; seen[k] = 1;
      var on = !d.deliverSkip[k];
      s.appendChild(h('label', { cls: 'chk deliver-row' }, h('input', { type: 'checkbox', checked: x.locked ? true : on, disabled: x.locked ? true : null, 'aria-describedby': x.locked ? 'dl-lock' : null, on: { change: function (e) { if (e.target.checked) delete d.deliverSkip[k]; else d.deliverSkip[k] = 1; } } }),
        h('span', null, h('b', { text: x.core }), h('span', { cls: 'muted', text: '｜' + x.learner + (x.locked ? '' : '｜' + x.grade) + (x.absent ? '｜學習者不在場，印照顧者版' : '') + (x.exhausted ? '｜已交付 ' + x.times + ' 次仍未確認，送出即開保底待辦' : x.needFallback ? '｜送出即開保底待辦' : x.locked ? '｜生存必需' : '') + (x.times ? '｜已交付 ' + x.times + ' 次' : '') }))));
    });
    return s;
  }
  function stepWrap(n, b, d, locked) {
    var s = h('section', { cls: 'step' + (locked ? ' locked' : '') }, h('span', { cls: 'n', text: n }), h('h2', { text: '收尾' }));
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '接續安排' }), seg(S.info.enums.CONTINUITY, d.continuity, function (v) { d.continuity = d.continuity === v ? '' : v; touch(); renderPatient($('app')); }, '', '接續'),
      h('div', { cls: 'hint', text: d.certainty === '最後一次' ? '最後一次：請選交班、轉介或結案；出院時承接包會自動交給下一位。' : '選一項；交班與轉介的對象在下方或側欄設定。' })));
    if (d.continuity === '下次見面') s.appendChild(apptForm(b, d));
    if (b.zero_teach) s.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '本次只做評估或轉介', on: { click: function () { b.queue.concat(d.added).forEach(function (q) { var r = d.results[q.learner_id + '|' + q.item_id]; if (r && !r.tb_result) r.tb_result = '未處理'; }); d.zeroTeach = true; touch(); renderPatient($('app')); } } }));
    s.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '下次建議職類（選填）' }), seg(S.info.roles.map(function (r) { return { v: r.id, t: r.name }; }), d.nextRoles, function (v) { var i = d.nextRoles.indexOf(v); if (i >= 0) d.nextRoles.splice(i, 1); else d.nextRoles.push(v); renderPatient($('app')); }, '', '下次職類')));
    var note = h('input', { type: 'text', id: 'nnote', maxlength: '80', value: d.nextNote, on: { input: function () { d.nextNote = note.value; } } });
    s.appendChild(h('div', { cls: 'field' }, h('label', { for: 'nnote', text: '給下一位的一句話（選填）' }), note));
    b.others.forEach(function (o) {
      var on = d.refer.some(function (r) { return r.to_role === o.role; });
      s.appendChild(h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', minHeight: '44px' } }, h('input', { type: 'checkbox', checked: on, on: { change: function (e) { if (e.target.checked) d.refer.push({ to_role: o.role, reason: '需專業深度' }); else d.refer = d.refer.filter(function (r) { return r.to_role !== o.role; }); } } }), '轉介' + o.role_name + '（' + o.count + ' 項：' + o.titles.join('、') + '）'));
    });
    var notDone = h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '今天無法進行？' }), seg(S.info.enums.NOT_DONE, d.notDone, function (v) { d.notDone = d.notDone === v ? '' : v; renderPatient($('app')); renderSubmitBar(b, d); }, '', '未能進行'), h('div', { cls: 'hint', text: '選了就只記錄這次未能進行，不算教學未通過，下次排序不受影響。' }));
    s.appendChild(notDone);
    return s;
  }
  function missing(b, d) {
    if (d.notDone) return [];
    var m = [];
    if (d.ack.length < 4) m.push('承接確認');
    b.queue.concat(d.added).forEach(function (q) { var r = d.results[q.learner_id + '|' + q.item_id]; if (!r || !r.tb_result) m.push('教回結果'); });
    if (isChanged(b, d) && !d.overrideReason && !(d.zeroTeach && b.zero_teach)) m.push('改選理由');
    b.pending_commits.forEach(function (c) { if (!d.followups[c.learner_id + '|' + c.item_id]) m.push('承諾追問'); });
    b.elements_bedside.filter(function (e) { return e.mine && e.required && e.due; }).forEach(function (e) { if (d.elements[e.id] === undefined) m.push(e.name); });
    return m.filter(function (x, i) { return m.indexOf(x) === i; });
  }
  function renderSubmitBar(b, d) {
    var m = missing(b, d);
    var btn = h('button', { cls: 'btn', type: 'button', disabled: m.length ? true : null, text: d.notDone ? '記錄未能進行' : '送出並產生單張', on: { click: function () { submitEncounter(btn); } } });
    var oq = S.thread && S.thread.person_id === b.person.person_id ? S.thread.open_questions : 0;
    var pqBtn = b.pq ? h('button', { cls: 'btn pqbtn', type: 'button', id: 'pqopen', 'aria-haspopup': 'dialog', text: '病人問了問題', on: { click: function () { pqOpen(b); } } }) : null;
    setBar([pqBtn, h('div', { cls: 'msg', 'aria-live': 'polite' }, m.length ? [h('span', { text: '尚缺：' }), h('b', { text: m.join('、') })] : '可以送出', oq ? h('span', { cls: 'oq', text: '｜有 ' + oq + ' 則留言待您回覆（不影響送出）' }) : null), btn]);
  }
  function submitEncounter(btn) {
    var b = S.b, d = S.draft; btn.disabled = true;
    var results = Object.keys(d.results).map(function (k) { return d.results[k]; }).filter(function (r) { return r.tb_result; });
    var payload = {
      personId: d.pid, setting: b.setting, learnerIds: d.learnerIds, handoverAck: d.ack, ackSeconds: d.ackSeconds, fillSeconds: Math.round((Date.now() - d.openTs) / 1000), clicks: d.clicks,
      events: d.events, result: d.notDone ? '未能進行' : '完成', notDoneReason: d.notDone || '', curiosity: d.curiosity, time: d.time, primary: d.primary, wanted: d.wanted, communication: d.communication,
      elements: d.elements, prepId: b.prep ? b.prep.id : '', readmitBarrier: d.readmitBarrier,
      commitFollowups: Object.keys(d.followups).map(function (k) { return d.followups[k]; }),
      results: d.notDone ? [] : results, commits: Object.keys(d.commits).map(function (k) { return d.commits[k]; }),
      overrideReason: d.overrideReason, nextNote: d.nextNote, nextRoles: d.nextRoles, refer: d.refer, medChanges: d.medChanges || [],
      certainty: d.certainty, continuity: d.continuity, bed: d.bed, deliverSkip: Object.keys(d.deliverSkip),
      nextAppt: d.continuity === '下次見面' && d.nextAppt && d.nextAppt.date ? d.nextAppt : null
    };
    api('submitEncounter', payload, { idemKey: d.idemKey }).then(function (r) {
      d.dirty = false; dropDraft(d.pid);
      if (r.replay) { toast('已送出過，不會重複寫入'); location.hash = '#/'; return; }
      if (!r.handout) { toast('已記錄'); S.draft = null; S.b = null; location.hash = '#/'; return; }
      S.handout = { pid: d.pid, id: r.handout.handout_id, draft: r.handout.draft, sections: r.handout.sections, note: r.note, comm: d.communication, completeness: r.completeness, edits: { points: [], hidden: {}, selfWritten: [] } };
      S.draft = null; S.b = null;
      location.hash = '#/handout';
    }).catch(function (e) { btn.disabled = false; toast(e.message); });
  }

  /** 停復藥紀錄（R-09）：暫停或預定停藥，含吃回條件與日期；伺服器驗證 */
  function holdForm(b) {
    var v = { type: '' }, box = h('div');
    var med = h('select', { 'aria-label': '暫停的藥' }, b.meds.map(function (m) { return h('option', { value: m.med_id, text: m.name }); }));
    var cond = h('input', { type: 'text', id: 'hcond', maxlength: '60', placeholder: '例：可以正常吃飯後' });
    var date = h('input', { type: 'date', id: 'hdate' });
    var dl = h('label', { for: 'hdate', text: '確認日' });
    var draw = function () { clear(box).appendChild(seg(S.info.enums.HOLD_TYPE, v.type, function (x) { v.type = x; dl.textContent = x === '預定停藥' ? '預定停藥日' : '確認日（何時再確認能否吃回）'; draw(); }, '', '暫停類型')); };
    draw();
    med.id = 'hmed';
    return h('details', { cls: 'noprint' }, h('summary', { text: '登錄暫停或預定停藥' }),
      h('div', { cls: 'field' }, h('label', { for: 'hmed', text: '藥' }), med), h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '類型' }), box),
      h('div', { cls: 'field' }, h('label', { for: 'hcond', text: '吃回條件' }), cond), h('div', { cls: 'field' }, dl, date),
      h('button', { cls: 'btn quiet', type: 'button', text: '登錄', on: { click: function () {
        api('setMedHold', { personId: b.person.person_id, setting: b.setting, medId: med.value, type: v.type, resumeCondition: cond.value, date: date.value }).then(function (nb) { S.b = nb; toast('已登錄'); renderPatient($('app')); }).catch(fail);
      } } }));
  }
  /** 新增學習者（R-09）：例如照顧者第二次才出現 */
  function learnerForm(b) {
    var v = { type: '', literacy: '未評估' }, box = h('div');
    var draw = function () { clear(box).appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '學習者類型' }), seg(S.info.enums.LEARNER_TYPE.filter(function (x) { return x !== '本人'; }), v.type, function (x) { v.type = x; draw(); }, '', '學習者類型'))); box.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '識能' }), seg(S.info.enums.LITERACY, v.literacy, function (x) { v.literacy = x; draw(); }, '', '學習者識能'))); };
    draw();
    return h('details', { cls: 'noprint' }, h('summary', { text: '新增學習者（家屬或照顧者）' }), box,
      h('button', { cls: 'btn quiet', type: 'button', text: '新增', on: { click: function () {
        if (!v.type) { toast('請選學習者類型'); return; }
        api('addLearner', { personId: b.person.person_id, setting: b.setting, learner: { type: v.type, literacy: v.literacy, giver: v.type === '主要照顧者' } }).then(function (r) { S.b = r.bundle; toast('已新增'); renderPatient($('app')); }).catch(fail);
      } } }));
  }
  /** 照護設定：照護目標（care_goal）、疾病知情（disclosure）；只對有該能力的職類顯示 */
  function carePanel(b) {
    var caps = S.me.caps, p = h('div', { cls: 'panel' }, h('h3', { text: '照護設定' }));
    var refresh = function (nb) { S.b = nb; renderPatient($('app')); };
    // N09：照護目標改變會改變全部職類的教學佇列，點選後須再按「確認變更」才寫入
    if (caps.indexOf('care_goal') >= 0) {
      var cur = b.person.care_goal || '一般', cg = h('div'), cgBox = h('div');
      var drawCg = function (pick) {
        clear(cgBox).appendChild(seg(S.info.enums.CARE_GOAL, pick, function (v) { drawCg(v); }, '', '照護目標'));
        clear(cg); if (pick !== cur) cg.appendChild(h('div', { cls: 'inline' }, h('p', { cls: 'hint', text: '將由「' + cur + '」改為「' + pick + '」，所有職類的教學項目會重排。' }),
          h('button', { cls: 'btn', type: 'button', text: '確認變更', on: { click: function () { api('setCareGoal', { personId: b.person.person_id, goal: pick, setting: b.setting }).then(function (nb) { toast('照護目標：' + pick); refresh(nb); }).catch(fail); } } }),
          h('button', { cls: 'btn ghost', type: 'button', text: '取消', on: { click: function () { drawCg(cur); } } })));
      };
      drawCg(cur);
      p.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '照護目標' }), cgBox, cg));
    }
    if (caps.indexOf('disclosure') >= 0) b.diseases.filter(function (x) { return x.level !== '共病標記'; }).forEach(function (x) {
      p.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: x.name + '：病人是否知道診斷' + (x.disclosure ? '' : '（尚無紀錄）') }), seg(S.info.enums.DISCLOSURE, x.disclosure || null, function (v) { api('setDisclosure', { personId: b.person.person_id, diseaseId: x.id, disclosure: v }).then(function () { return api('recomputeQueue', { personId: b.person.person_id, setting: b.setting }); }).then(function (nb) { toast(x.name + '：' + v); refresh(nb); }).catch(fail); }, '', x.name + '知情')));
    });
    return p.childNodes.length > 1 ? p : null;
  }
  /** 異常通報：內容錯誤、與醫囑不符等，送 L3 處理 */
  function incidentForm(ctx) {
    var v = { type: '' }, box = h('div'), desc = h('textarea', { id: 'incdesc', maxlength: '300' });
    var draw = function () { clear(box).appendChild(seg(S.info.enums.INCIDENT_TYPE, v.type, function (x) { v.type = x; draw(); }, '', '通報類型')); };
    draw();
    return h('details', { cls: 'noprint' }, h('summary', { text: '異常通報' }), h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '類型' }), box),
      h('div', { cls: 'field' }, h('label', { for: 'incdesc', text: '發生什麼事（300 字內）' }), h('div', { cls: 'hint', text: '不要寫病人姓名或病歷號。' }), desc), h('button', { cls: 'btn quiet', type: 'button', text: '送出通報', on: { click: function () {
      api('incident.report', Object.assign({ type: v.type, desc: desc.value }, ctx)).then(function () { toast('已通報，系統管理者會處理'); desc.value = ''; }).catch(fail);
    } } }));
  }
  /* ---------- D50 照護預定 ---------- */
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  /** H14：病人端系統字句由後端字典帶入（舊草稿無 ui 時用同字預設） */
  function U(k, d) { var D0 = (S.handout && S.handout.draft) || {}; return (D0.ui && D0.ui[k]) || d; }
  function fmtDate(ymd) { var t = new Date(ymd + 'T00:00:00'); return (t.getMonth() + 1) + '月' + t.getDate() + '日（' + WD[t.getDay()] + '）'; }
  function ymdLocal(t) { return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function addDaysL(ymd, n) { var t = new Date(ymd + 'T00:00:00'); t.setDate(t.getDate() + n); return ymdLocal(t); }
  /** 病人用行事曆檔：只有日期、時段、地點、職類；不含疾病名、姓名、病歷號 */
  function downloadIcs(NA) {
    var d = NA.date.replace(/-/g, ''), st = NA.time ? NA.time.replace(':', '') : NA.ics.start, en = NA.time ? ('0' + (Number(NA.time.slice(0, 2)) + 1)).slice(-2) + NA.time.slice(3) : NA.ics.end;
    var esc = function (x) { return String(x || '').replace(/[\\,;]/g, function (c) { return '\\' + c; }); };
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareTeam//ZH-TW', 'BEGIN:VEVENT', 'UID:' + d + st + '-' + Math.random().toString(36).slice(2) + '@careteam', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART:' + d + 'T' + st + '00', 'DTEND:' + d + 'T' + en + '00', 'SUMMARY:' + esc(NA.role + (NA.phone ? '電話聯絡' : '見面')), NA.place ? 'LOCATION:' + esc(NA.place) : '', 'DESCRIPTION:' + esc((NA.bring.length ? U('BRING_LEAD', '請帶：') + NA.bring.join('、') + '。' : '') + (NA.note || '')), 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'next-visit.ics' }); document.body.appendChild(a); a.click(); a.remove();
  }
  function apptForm(b, d) {
    var A = b.appts || { types: [], slots: [], places: [] };
    if (!d.nextAppt) d.nextAppt = { type: A.types[1] || A.types[0], date: '', slot: A.slots[0], place: '', time: '', fromSuggestion: false };
    var na = d.nextAppt, box = h('div', { cls: 'appt-form' });
    var setDate = function (v, sug) { na.date = v; na.fromSuggestion = !!sug; if (sug) na.link = { kind: 'suggest', key: sug.key }; else delete na.link; d.certainty = v ? '已約下次' : d.certainty; touch(); renderPatient($('app')); };
    if ((b.appt_suggestions || []).length) box.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '系統建議日（按下才採用；依紀錄計算的聯絡建議，不是醫囑，停藥或復藥日以醫囑為準）' }), h('div', { cls: 'chips sug' }, b.appt_suggestions.slice(0, 4).map(function (x) { return h('button', { type: 'button', cls: 'chip-btn', 'aria-pressed': String(na.date === x.date && na.fromSuggestion), title: x.reason, on: { click: function () { setDate(x.date, x); } } }, fmtDate(x.date), h('span', { cls: 'muted', text: '｜' + x.reason })); }))));
    var di = h('input', { type: 'date', id: 'adate', min: A.today, value: na.date, on: { change: function () { setDate(di.value, null); } } });
    box.appendChild(h('div', { cls: 'field' }, h('label', { for: 'adate', text: '下次見面日期' }), di));
    box.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '時段' }), seg(A.slots, na.slot, function (v) { na.slot = v; renderPatient($('app')); }, '', '時段')));
    box.appendChild(h('details', null, h('summary', { text: '類型、地點、時刻（選填）：' + na.type + (na.place ? '｜' + na.place : '') }),
      h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '類型' }), seg(A.types, na.type, function (v) { na.type = v; renderPatient($('app')); }, '', '預定類型')),
      h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '地點' }), seg(A.places, na.place, function (v) { na.place = na.place === v ? '' : v; renderPatient($('app')); }, '', '地點')),
      h('div', { cls: 'field' }, h('label', { for: 'atime', text: '時刻' }), h('input', { type: 'time', id: 'atime', value: na.time, on: { change: function (e) { na.time = e.target.value; } } }))));
    var same = (A.upcoming || []).filter(function (a) { return na.date && Math.abs((new Date(a.date) - new Date(na.date)) / 86400000) <= 7; });
    if (same.length) box.appendChild(h('p', { cls: 'hint', text: '前後 7 天已有：' + same.map(function (a) { return fmtDate(a.date) + ' ' + a.role_name + a.type; }).join('、') + '。可考慮同日見面，減少病人往返。' }));
    box.appendChild(h('p', { cls: 'hint', text: '這是團隊的照護預定，不是門診掛號；不會通知病人。日期會印在單張上。' }));
    return box;
  }
  function apptSidePanel(b) {
    var A = b.appts, box = h('div', { cls: 'panel appt-side' }, h('h3', { text: '照護預定' }));
    if (!A.upcoming.length) box.appendChild(h('p', { cls: 'muted', text: '沒有未來的預定。' }));
    A.upcoming.forEach(function (a) {
      var act = h('div', { cls: 'inline' });
      var pickReason = function (action) {
        clear(act);
        var nd = h('input', { type: 'date', 'aria-label': '新日期', min: A.today, value: a.date });
        if (action === '改期') act.appendChild(nd);
        act.appendChild(seg(A.reasons, '', function (r) { api('appt.update', { personId: b.person.person_id, apptId: a.id, action: action, reason: r, date: nd.value }).then(function (d) { b.appts = d.list; S.threadAt = 0; /* VR11-12：預定變更後對話串立即重取 */ toast(action === '改期' ? '已改期' : '已取消'); renderPatient($('app')); }).catch(fail); }, '', action + '原因'));
      };
      if (a.status === '預定') { act.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '改期', on: { click: function () { pickReason('改期'); } } })); act.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '取消', on: { click: function () { pickReason('取消'); } } })); }
      box.appendChild(h('div', { cls: 'appt-row' }, h('div', null, h('b', { text: fmtDate(a.date) + ' ' + a.slot }), h('span', { cls: 'muted', text: '｜' + a.role_name + ' ' + a.type + (a.place ? '｜' + a.place : '') + (a.source === '系統建議' ? '｜系統建議' : '') })), act));
    });
    if (A.recent.length) box.appendChild(h('details', null, h('summary', { text: '近 30 天紀錄 ' + A.recent.length + ' 筆' }), h('ul', null, A.recent.map(function (a) { return h('li', { text: a.date + ' ' + a.role_name + a.type + '｜' + a.status + (a.reason ? '（' + a.reason + '）' : '') }); }))));
    return box;
  }
  function calendarPage(app) {
    var st = S.cal || (S.cal = { scope: 'mine', view: '清單', from: '', today: '' });
    // 以伺服器日期為準（瀏覽器時鐘可能不同）
    if (!st.from) { api('appt.list', { scope: st.scope }).then(function (d) { st.today = d.from; st.from = st.view === '月' ? d.from.slice(0, 8) + '01' : d.from; route(); }).catch(function (e) { fail(e, app); }); return; }
    var TODAY = st.today;
    app.appendChild(h('h1', { text: '行事曆' }));
    app.appendChild(h('p', { cls: 'lede', text: '團隊的照護預定：自己的、本職類的' + (S.me.acting_role === 'CM' ? '、收案病人的' : '') + '。只顯示稱謂與病歷號末四碼，時段只算人數不設名額。' }));
    var scopes = [{ v: 'mine', t: '我的' }, { v: 'role', t: '本職類' }]; if (S.me.acting_role === 'CM') scopes.push({ v: 'case', t: '收案病人' });
    var bar = h('div', { cls: 'inline cal-bar' }, seg(scopes, st.scope, function (v) { st.scope = v; route(); }, '', '範圍'), seg(['清單', '週', '月'], st.view, function (v) { st.view = v; if (v === '月') st.from = st.from.slice(0, 8) + '01'; route(); }, '', '檢視'),
      h('button', { cls: 'btn quiet', type: 'button', text: '往前', on: { click: function () { st.from = st.view === '月' ? addMonth(st.from, -1) : addDaysL(st.from, st.view === '週' ? -7 : -28); route(); } } }),
      h('button', { cls: 'btn quiet', type: 'button', text: '今天', on: { click: function () { st.from = ''; route(); } } }),
      h('button', { cls: 'btn quiet', type: 'button', text: '往後', on: { click: function () { st.from = st.view === '月' ? addMonth(st.from, 1) : addDaysL(st.from, st.view === '週' ? 7 : 28); route(); } } }));
    app.appendChild(bar);
    var out = h('div', { cls: 'cal-out', 'aria-live': 'polite' }); app.appendChild(out);
    var to = st.view === '月' ? addDaysL(addMonth(st.from, 1), -1) : addDaysL(st.from, st.view === '週' ? 6 : 27);
    api('appt.list', { scope: st.scope, from: st.from, to: to }).then(function (d) {
      var byDate = {}; d.rows.forEach(function (a) { (byDate[a.date] = byDate[a.date] || []).push(a); });
      var row = function (a) { return h('li', { cls: 'st-' + a.status }, h('div', { cls: 'main' }, h('div', { cls: 't', text: a.slot + (a.time ? ' ' + a.time : '') + '　' + (a.title || '未填稱謂') + '　' + a.tail }), h('div', { cls: 'muted', text: a.role_name + ' ' + a.type + (a.place ? '｜' + a.place : '') + (a.to_name ? '｜' + a.to_name : '') })), h('span', { cls: 'chip ' + (a.status === '已完成' ? 'ok' : a.status === '未到' ? 'warn' : ''), text: a.status })); };
      if (!d.rows.length) out.appendChild(h('p', { cls: 'muted', text: d.from + ' 到 ' + d.to + ' 沒有照護預定。到病人收尾選「下次見面」即可建立。' }));
      if (st.view === '月') {
        var first = new Date(st.from + 'T00:00:00'), grid = h('div', { cls: 'cal-month', role: 'group', 'aria-label': st.from.slice(0, 7) + ' 月曆' });
        WD.forEach(function (w) { grid.appendChild(h('div', { cls: 'wd', 'aria-hidden': 'true', text: w })); });
        for (var i = 0; i < first.getDay(); i++) grid.appendChild(h('div', { cls: 'cell empty' }));
        for (var day = st.from; day <= d.to; day = addDaysL(day, 1)) { (function (day) { var n = (byDate[day] || []).length; grid.appendChild(h('button', { type: 'button', cls: 'cell' + (n ? ' has' : '') + (day === TODAY ? ' today' : ''), 'aria-label': fmtDate(day) + ' ' + n + ' 位', on: { click: function () { st.view = '清單'; st.from = day; route(); } } }, h('span', { cls: 'dn', text: String(Number(day.slice(8))) }), n ? h('span', { cls: 'cnt', text: n + ' 位' }) : null)); })(day); }
        out.appendChild(h('h2', { text: st.from.slice(0, 4) + ' 年 ' + Number(st.from.slice(5, 7)) + ' 月' })); out.appendChild(grid); return;
      }
      for (var dd = d.from; dd <= d.to; dd = addDaysL(dd, 1)) {
        var list = byDate[dd] || [];
        if (st.view === '清單' && !list.length) continue;
        var load = (d.slots || []).map(function (sl) { var n = d.load[dd + '|' + sl]; return n ? sl + ' ' + n + ' 位' : ''; }).filter(Boolean).join('、');
        out.appendChild(h('section', { cls: 'cal-day' + (dd === TODAY ? ' today' : '') }, h('h2', null, fmtDate(dd), load ? h('span', { cls: 'muted', text: '　' + load }) : null), list.length ? h('ul', { cls: 'list' }, list.map(row)) : h('p', { cls: 'muted', text: '無' })));
      }
    }).catch(function (e) { fail(e, out); });
  }
  function addMonth(ymd, n) { var t = new Date(ymd.slice(0, 8) + '01T00:00:00'); t.setMonth(t.getMonth() + n); return ymdLocal(t); }
  function renderSide(side, b, d) {
    var cp = carePanel(b); if (cp) side.appendChild(cp);
    if (b.fallback && b.fallback.length) side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '保底中的項目' }), h('ul', null, b.fallback.map(function (f) {
      // UX11-2：寫出原轉介日與逾期天數；保底待辦交給本職類時可直接承接或完成
      var li = h('li', null, h('div', { text: f.core }), h('div', { cls: 'muted', text: ((f.kind || '轉介') === '保底' ? '保底待辦，' + f.since + ' 開立' : (f.kind || '轉介') + '給' + f.from_role + '，' + f.since + ' 起') + (f.overdue ? '，逾期 ' + f.overdue + ' 天' : '') + '未接手' + (f.teach_open ? '；本職類可教到「會做」' : '；已開保底待辦') }));
      if (f.task && f.task_role === S.me.acting_role) li.appendChild(h('div', { cls: 'inline' }, ['承接', '完成'].map(function (a) { return h('button', { cls: 'btn quiet', type: 'button', text: a === '承接' ? '已聯絡，由我接手' : '已處理，結案', on: { click: function () { api('handoffRespond', { taskId: f.task, action: a }).then(function () { toast(a === '承接' ? '已接手' : '已結案'); S.b = null; route(); }).catch(fail); } } }); })));
      return li;
    }))));
    if (b.progress) side.appendChild(h('p', { cls: 'muted', text: '已學會（到上次為止，全部職類；層級達「知道」）：' + ((b.progress.by_learner || []).length ? b.progress.by_learner.map(function (x) { return x.type + ' ' + x.known + ' 項'; }).join('、') : b.progress.known + ' 項') + '。單張的數字會含這次。' }));
    if (b.appts && (b.appts.upcoming.length || b.appts.recent.length)) side.appendChild(apptSidePanel(b));
    side.appendChild(threadPanel(b));
    side.appendChild(h('div', { cls: 'panel' }, learnerForm(b)));
    if (b.safety_alerts.length) side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '安全提示' }), b.safety_alerts.map(function (a) { return h('div', { cls: 'alert ' + (a.severity === '高' ? 'high' : 'mid'), text: a.message + (a.unsigned ? '（規則待簽核）' : '') }); })));
    b.conflicts.filter(function (c) { return !c.resolved; }).forEach(function (c) {
      side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '待裁決的建議衝突' }), h('p', { text: '單張先印：「' + c.neutral + '」' }), h('div', { cls: 'muted', text: '甲：' + c.aBasis + '｜乙：' + c.bBasis }),
        S.me.acting_role === c.role ? seg([{ v: 'A', t: '採甲' }, { v: 'B', t: '採乙' }, { v: '個別化', t: '個別化' }], null, function (v) { api('adjudicate', { personId: b.person.person_id, conflictId: c.id, choice: v }).then(function (nb) { S.b = nb; renderPatient($('app')); toast('已裁決'); }).catch(fail); }) : h('div', { cls: 'muted', text: '由' + c.role + '裁決' })));
    });
    if (b.decisions.length) side.appendChild(sdmPanel(b));
    var mp = h('div', { cls: 'panel' }, h('h3', { text: '全人照護地圖' }));
    if (!b.care_map.length) mp.appendChild(h('p', { cls: 'muted', text: '尚無教學紀錄。' }));
    // VR11-3／UX11-13：同主題合併為一組，組內逐品項（品項句＋層級＋最後教的職類）
    var mapGroups = [], mapBy = {};
    b.care_map.slice(0, 30).forEach(function (c) { var k = (c.topic || c.title) + '|' + (c.learner || ''); if (!mapBy[k]) { mapBy[k] = { topic: c.topic || c.title, learner: c.learner, rows: [] }; mapGroups.push(mapBy[k]); } mapBy[k].rows.push(c); });
    var multiLearner = mapGroups.some(function (g) { return g.learner && g.learner !== '本人'; }) || (b.learners || []).filter(function (l) { return l.present; }).length > 1;
    mapGroups.forEach(function (g) {
      var best = Math.max.apply(null, g.rows.map(function (c) { return c.L; }));
      mp.appendChild(h('div', { cls: 'map-group' }, h('div', { cls: 'map-head' }, ladder(best), h('b', { text: g.topic + (multiLearner && g.learner ? '（' + g.learner + '）' : '') })),
        g.rows.length > 1 || (g.rows[0].core && g.rows[0].core !== g.topic) ? h('ul', { cls: 'map-items' }, g.rows.map(function (c) { var by = [roleNm(c.last_role), c.last].filter(Boolean).join(' '); return h('li', null, h('span', { text: c.core || ('（' + c.item_id + '）') }), h('span', { cls: 'muted nw', text: '｜' + (LV[c.L] || c.L) + (by ? '｜' + by : '') })); })) : h('div', { cls: 'muted', text: [roleNm(g.rows[0].last_role), g.rows[0].last].filter(Boolean).join(' ') || '尚無教學紀錄' })));
    });
    side.appendChild(mp);
    side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '待教量' }), h('p', { text: '生存必需 ' + b.backlog.by_grade['生存必需'] + '｜自我管理 ' + b.backlog.by_grade['自我管理'] + '｜最佳化 ' + b.backlog.by_grade['最佳化'] }), h('p', { cls: 'muted', text: '依目前上限約需 ' + b.backlog.est_encounters + ' 次；' + b.backlog.by_role.map(function (x) { return x.role_name + ' ' + x.n; }).join('、') }),
      handoffForm(b)));
    if (b.others.length) side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '接下來會有誰跟病人談' }), b.others.map(function (o) { return h('div', { text: o.role_name + '：' + o.titles.join('、') + (o.last ? '（上次 ' + o.last + '）' : '（近期無接觸）') + (o.proxy_ok ? '｜可由您先代為說明到「知道」' : '') }); }),
      (b.proxy || []).filter(function (q) { return !d.added.some(function (x) { return x.item_id === q.item_id && x.learner_id === q.learner_id; }); }).map(function (q) {
        return h('button', { cls: 'btn quiet', type: 'button', text: '代講：' + q.core, title: '代講只到「知道」層，送出後自動轉介主責職類', on: { click: function () { d.added.push(q); touch(); renderPatient($('app')); } } });
      })));
    side.appendChild(h('div', { cls: 'panel' }, incidentForm({ personId: b.person.person_id })));
    if (b.goals.length) side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '目標' }), b.goals.map(function (g) { return h('div', { text: g.param + '：' + (g.conflict ? '目標待醫師決定' : g.text) }); })));
    var meds = h('div', { cls: 'panel' }, h('h3', { text: '用藥（' + b.meds.length + '）' }), h('ul', null, b.meds.map(function (m) { return h('li', { text: m.name }); })),
      b.holds.length ? h('div', null, b.holds.map(function (x) { return h('div', { cls: x.overdue ? 'alert high' : 'muted', text: x.type + '：' + x.med_id + '（' + x.status + '，' + (x.due || '') + '）' }); })) : null,
      h('a', { cls: 'btn quiet', href: '#/wallet/' + b.person.person_id, text: '隨身卡' }));
    if (S.me.caps.indexOf('med_list') >= 0) meds.appendChild(medBox(b, function (mc) { d.medChanges = mc; toast('送出時一併更新用藥'); }));
    if (S.me.caps.indexOf('med_hold') >= 0 && b.meds.length) meds.appendChild(holdForm(b));
    if (S.me.caps.indexOf('med_hold') >= 0) meds.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: b.sickday ? '重新確認生病日藥單' : '確認生病日藥單', on: { click: function () { api('setMedHold', { personId: b.person.person_id, sickDayConfirm: true }).then(function (nb) { S.b = nb; toast('已確認，隨身卡會列出藥名'); renderPatient($('app')); }).catch(fail); } } }));
    side.appendChild(meds);
    if (S.me.scope[0] !== 'ALL') S.me.scope.forEach(function (dz) {
      if (!b.diseases.some(function (x) { return x.id === dz && x.status === '已確認'; })) return;
      var mine = b.specialist.some(function (s) { return s.disease === dz && s.person === S.me.person_id; });
      side.appendChild(h('button', { cls: 'btn ghost', type: 'button', text: (mine ? '釋出' : '專責收案：') + dzName(dz), on: { click: function () { api('claim', { personId: b.person.person_id, diseaseId: dz, release: mine }).then(function (nb) { S.b = nb; renderPatient($('app')); }).catch(fail); } } }));
    });
    if (b.specialist.length) side.appendChild(h('p', { cls: 'muted', text: '專責：' + b.specialist.map(function (s) { return dzName(s.disease) + ' ' + s.name; }).join('、') }));
    if (b.notes.length) side.appendChild(h('div', { cls: 'panel' }, h('h3', { text: '交接留言' }), b.notes.map(function (x) { return h('div', { text: x.ts.slice(0, 10) + ' ' + x.role + '：' + x.text }); })));
  }
  function handoffForm(b) {
    var role = h('select', { id: 'hfrole', 'aria-label': '交班職類' }, S.info.roles.map(function (r) { return h('option', { value: r.id, selected: r.id === S.me.acting_role, text: r.name }); }));
    var email = h('input', { type: 'email', id: 'hfemail', 'aria-label': '指定同仁電郵（選填）' });
    var note = h('input', { type: 'text', id: 'hfnote', maxlength: '80', 'aria-label': '交班事項' });
    return h('details', null, h('summary', { text: '交班給同仁或職類' }),
      h('div', { cls: 'field' }, h('label', { for: 'hfrole', text: '交班職類' }), role),
      h('div', { cls: 'field' }, h('label', { for: 'hfemail', text: '指定同仁電郵（選填）' }), email),
      h('div', { cls: 'field' }, h('label', { for: 'hfnote', text: '交班事項（80 字內）' }), note), h('button', { cls: 'btn quiet', type: 'button', text: '送出交班', on: { click: function () { api('handoff', { personId: b.person.person_id, toRole: role.value, toEmail: email.value.trim(), note: note.value }).then(function () { toast('已交班'); }).catch(fail); } } }));
  }
  function sdmPanel(b) {
    var p = h('div', { cls: 'panel' }, h('h3', { text: '共享決策' }));
    b.decisions.forEach(function (dc) {
      var box = h('div', { style: { borderTop: '1px solid var(--line)', paddingTop: '8px' } }, h('b', { text: dc.name }), h('div', { cls: 'muted', text: '階段：' + dc.stage + '｜證據確定性：' + (dc.certainty || '未載') + (dc.chosen ? '｜決定：' + dc.chosen : '') }));
      box.appendChild(h('table', { cls: 't' }, h('tr', null, h('th', { text: '選項' }), h('th', { text: '可能好處' }), h('th', { text: '可能壞處' }), h('th', { text: '數字' })), dc.aid.rows.map(function (r) { return h('tr', null, h('td', { text: r.option }), h('td', { text: r.benefit }), h('td', { text: r.harm }), h('td', { text: r.freq })); })));
      var next = { '待啟動': '已告知選項', '已告知選項': '已說明選項', '已說明選項': '已釐清價值' }[dc.stage];
      if (next) box.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '記錄：' + next, on: { click: function () { api('decision.update', { personId: b.person.person_id, decisionId: dc.id, stage: next, explained: next === '已說明選項' ? dc.options.map(function (o) { return o.name; }) : [] }).then(function (nb) { S.b = nb; renderPatient($('app')); }).catch(fail); } } }));
      if (dc.can_decide && ['已說明選項', '已釐清價值', '延後'].indexOf(dc.stage) >= 0) {
        var sc = dc.screen_items.map(function () { return null; }), ch = null;
        var form = h('div'); var redraw = function () {
          clear(form);
          form.appendChild(seg(dc.options.map(function (o) { return o.name; }), ch, function (v) { ch = v; redraw(); }, '', '選定選項'));
          dc.screen_items.forEach(function (q, i) { form.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: q }), seg(['是', '否'], sc[i] === null ? null : (sc[i] ? '是' : '否'), function (v) { sc[i] = v === '是'; redraw(); }))); });
          form.appendChild(h('button', { cls: 'btn', type: 'button', disabled: (!ch || sc.some(function (x) { return x === null; })) || null, text: '記錄決定', on: { click: function () { api('decision.update', { personId: b.person.person_id, decisionId: dc.id, stage: '已決定', chosen: ch, screen: sc, recheck: '下次回診' }).then(function (nb) { S.b = nb; renderPatient($('app')); toast(nb.decisions.filter(function (x) { return x.id === dc.id; })[0].stage === '延後' ? '篩檢未全通過，已記為延後' : '已記錄決定'); }).catch(fail); } } }));
        };
        redraw(); box.appendChild(h('details', null, h('summary', { text: '記錄決定' }), form));
      }
      p.appendChild(box);
    });
    return p;
  }

  /* ---------- 單張 ---------- */
  function handoutPage(app) {
    var H = S.handout; if (!H) { location.hash = '#/'; return; }
    var D = H.draft, E = H.edits;
    if ((D.pt_unsigned || []).length) app.appendChild(h('div', { cls: 'alert high noprint', role: 'alert', text: '單張含未簽核的病人端系統字句（' + D.pt_unsigned.join('、') + '），正式病人無法確認；請內容授權人簽核。' }));
    var large = H.comm && H.comm !== '無困難';
    app.appendChild(h('div', { cls: 'noprint' }, h('h1', { text: '確認單張' }), h('p', { cls: 'lede', text: '可換講法、修改文字、隱藏不需要的段落。求助與下次見面不可隱藏。存檔前會做健康識能檢查。' })));
    // D45 完整照護檢核：三個勾（不阻擋，列缺口）
    if (H.completeness) {
      var C = H.completeness, tick = function (ok, t) { return h('li', { cls: ok ? 'ok' : 'gap', text: (ok ? '已完成：' : '未完成：') + t }); };
      app.appendChild(h('section', { cls: 'panel noprint check3', 'aria-label': '完整照護檢核' }, h('h2', { text: C.safety && C.coverage && C.continuity ? '本次照護完整' : '本次照護尚有缺口' }),
        h('ul', null, tick(C.safety, '安全底線（求助與生存必需）'), tick(C.coverage, '全貌交付（本職類主題皆已教回或交付）'), tick(C.continuity, '接續安排')),
        C.gaps && C.gaps.length ? h('p', { cls: 'muted', text: '缺口：' + C.gaps.join('；') + '。可回今日名單用交班或轉介補上。' }) : null));
    }
    var sheet = h('article', { cls: 'sheet' + (large ? ' large' : ''), id: 'sheet' });
    var layerField = h('div', { cls: 'field noprint layer-field' }, h('span', { cls: 'lab', text: '列印範圍' }));
    app.appendChild(layerField);
    app.appendChild(sheet);
    var err = h('div', { cls: 'noprint' }); app.appendChild(err);
    var layer = D.layer_default || '展開';
    function lit(text) { var r = window.literacyCheck ? window.literacyCheck(text, 'sentence', {}) : { errors: [] }; return r.errors; }
    function sec(key, title, body) {
      var def = H.sections.filter(function (s) { return s.key === key; })[0] || {};
      var hidden = E.hidden[key];
      var off = (layer === '必印' && def.layer !== '必印') || (layer === '展開' && def.layer === '選印');
      var s = h('section', { cls: (hidden ? 'hidden-sec ' : '') + (off ? 'layer-off' : '') });
      var tools = h('span', { cls: 'sec-tools noprint' });
      if (def.hideable) tools.appendChild(hidden ? h('button', { cls: 'btn quiet', type: 'button', text: '恢復', on: { click: function () { delete E.hidden[key]; draw(); } } }) : h('select', { 'aria-label': '隱藏「' + title + '」的原因', on: { change: function (e) { if (e.target.value) { E.hidden[key] = e.target.value; draw(); } } } }, h('option', { value: '', text: '隱藏…' }), S.info.enums.HIDE_REASON.map(function (r) { return h('option', { value: r, text: r }); })));
      s.appendChild(h('h2', null, title, tools));
      add(s, body);
      return s;
    }
    function draw() {
      clear(sheet);
      sheet.appendChild(h('h1', { text: (D.address === '您的孩子' ? '照顧孩子的' : '') + '今天的照護重點' }));
      sheet.appendChild(h('div', { cls: 'muted', text: [D.hospital, D.date, D.role, D.version !== '一般' ? D.version + '版' : ''].filter(Boolean).join('｜') }));
      // M9 我的進度
      if (D.progress) sheet.appendChild(h('p', { cls: 'progress', text: '我的進度：到今天已學會 ' + D.progress.known + ' 項' + (D.progress.new_now ? '（含這次新學會 ' + D.progress.new_now + ' 項）' : '') }));
      sheet.appendChild(sec('points', '這次的重點', D.points.map(function (p, i) {
        var pe = E.points.filter(function (x) { return x.i === i; })[0] || (E.points.push({ i: i }), E.points[E.points.length - 1]);
        var core = h('div', { cls: 'core', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': '核心訊息', text: pe.core !== undefined ? pe.core : p.core, on: { blur: function (e) { var v = e.target.textContent.trim(); if (v !== p.core) { pe.core = v; if (!pe.coreReason) { pe.coreReason = '個別化'; } } } } });
        var txt = h('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': '說明', text: pe.text !== undefined ? pe.text : p.text, on: { blur: function (e) { var v = e.target.textContent.trim(); if (v !== p.text) { pe.text = v; var er = lit(v); if (er.length) toast(er[0]); } } } });
        return h('div', { style: { marginBottom: '12px' } }, core, /* VR11R4-2：有講法全文時不再加印一句話重點，避免三行同義 */ p.keypoint && !p.text && p.keypoint !== (pe.core !== undefined ? pe.core : p.core) ? h('div', { text: p.keypoint }) : null, txt, p.advanced ? h('div', { cls: 'muted', text: p.advanced }) : null,
          p.alts && p.alts.length > 1 ? h('div', { cls: 'noprint' }, h('button', { cls: 'btn quiet', type: 'button', text: '換說法', on: { click: function () { var cur = pe.variant_id || p.variant_id; var nx = p.alts[(p.alts.indexOf(cur) + 1) % p.alts.length]; pe.variant_id = nx; toast('存檔時套用另一種已簽核說法'); } } })) : null);
      })));
      if (D.known.length) sheet.appendChild(sec('known', '您已經會的', h('ul', null, D.known.map(function (k) { return h('li', { text: k }); }))));
      if (D.meds.length) sheet.appendChild(sec('meds', '我的藥', D.meds.map(function (m) { return h('div', { style: { marginBottom: '10px' } }, h('div', { cls: 'core', text: m.name }), h('div', { text: '為什麼吃：' + m.why }), h('div', { text: '怎麼吃：' + m.how }), m.discomfort ? h('div', { text: '可能不舒服：' + String(m.discomfort).replace(/[。；]+$/, '') + (m.selfcare ? '；' + m.selfcare : '') }) : null, m.urgent ? h('div', { cls: 'help119', text: m.urgent }) : null, m.sickday ? h('div', { text: '生病時：' + m.sickday }) : null, m.missed ? h('div', { text: '忘記吃：' + m.missed }) : null, m.avoid ? h('div', { text: '要避免：' + m.avoid }) : null); }).concat(D.meds_later.length ? [h('div', { cls: 'muted', text: '下次再談：' + D.meds_later.join('、') })] : [])));
      if (D.life.length) sheet.appendChild(sec('life', '吃喝與活動', h('ul', null, D.life.map(function (l) { return h('li', { text: (l.core ? l.core + '：' : '') + l.text }); }))));
      if (D.asked && D.asked.length) sheet.appendChild(sec('asked', U('PQ_HANDOUT_HEAD', '您問的問題'), h('ul', { cls: 'asked' }, D.asked.map(function (x) { return h('li', null, x.q ? h('span', { cls: 'asked-q', text: x.q }) : null, h('span', { text: [x.a, x.next].filter(Boolean).join('') })); }))));
      if (D.deliver && D.deliver.length) sheet.appendChild(sec('deliver', D.certainty === '已約下次' ? '帶回家看，下次請您說說看' : '帶回家看的', h('ul', null, D.deliver.map(function (k) { return h('li', { text: k }); }))));
      if (D.ask_next && D.ask_next.length) sheet.appendChild(sec('ask_next', '下次我們會請您說說看的', h('ul', null, D.ask_next.map(function (k) { return h('li', { text: k }); }))));
      sheet.appendChild(sec('todo', '回家做的一件事', D.todo.length ? h('p', { cls: 'core', text: D.todo[0] }) : h('p', { cls: 'write-in' }, h('span', { cls: 'nw', text: '和工作人員一起寫下：' }), h('span', { cls: 'blank', 'aria-hidden': 'true' }))));
      if (D.others.length) sheet.appendChild(sec('others', '接下來會有誰跟您談', h('ul', null, D.others.map(function (o) { return h('li', { text: o }); }))));
      sheet.appendChild(sec('help', '什麼時候要求助', h('div', null, D.help.l119.length ? h('div', null, h('div', { cls: 'help119', text: U('HEAD_119', '立刻撥 119') }), h('ul', null, D.help.l119.map(function (x) { return h('li', { cls: 'help119', text: x }); }))) : null,
        (D.help.led || []).length ? h('div', null, h('div', { cls: 'helped', text: U('HEAD_ED', '立刻去急診') }), h('ul', null, D.help.led.map(function (x) { return h('li', { cls: 'helped', text: x }); }))) : null,
        h('div', { cls: 'helpday' }, U('HEAD_DAY', '當天就要處理') + '（電話 ', h('span', { cls: 'phone', text: D.phone }), '）'), h('ul', null, D.help.lday.map(function (x) { return h('li', { text: x }); })))));
      var NA = D.next.appt;
      sheet.appendChild(sec('next', '下次見面', h('div', null,
        NA ? h('p', { cls: 'core appt-date', text: fmtDate(NA.date) + ' ' + NA.slot + (NA.time ? ' ' + NA.time : '') + (NA.place && !NA.phone ? '，' + NA.place : '') + '，' + NA.role + (NA.how || '和您見面') }) : h('p', { text: D.next.roles.length ? D.next.roles.join('、') + U('NEXT_ROLES', '會再和您談') : U('NEXT_NONE', '依醫師安排回診') }),
        NA && NA.bring.length ? h('p', null, U('BRING_LEAD', '請帶：') + NA.bring.join('、')) : null,
        D.next.note ? h('p', { cls: 'core', text: D.next.note }) : null,
        NA && NA.note ? h('p', { text: NA.note }) : null,
        NA ? h('button', { cls: 'btn quiet noprint', type: 'button', text: '下載行事曆檔', on: { click: function () { downloadIcs(NA); } } }) : null)));
      E.selfWritten.forEach(function (x, i) { sheet.appendChild(h('p', { cls: 'edit-line', text: x })); });
      var self = h('input', { type: 'text', cls: 'noprint', 'aria-label': '新增自寫說明', placeholder: '新增一句自寫說明（會加註「含照護者補充說明」）', on: { change: function (e) { var v = e.target.value.trim(); if (!v) return; var er = lit(v); if (er.length) { toast(er[0]); return; } E.selfWritten.push(v); draw(); } } });
      sheet.appendChild(self);
      sheet.appendChild(h('div', { cls: 'foot', text: '依據：' + (D.footer.sources.join('、') || '院內簽核內容') + (E.selfWritten.length ? '｜含照護者補充說明（未經內容庫簽核）' : '') + '｜本單張不含姓名與病歷號' }));
    }
    draw();
    var layerBox = h('span');
    function pickLayer(v) { layer = v; E.layer = v; clear(layerBox).appendChild(seg(['必印', '展開', '全部'], layer, pickLayer, '', '列印層別')); draw(); }
    layerBox.appendChild(seg(['必印', '展開', '全部'], layer, pickLayer, '', '列印層別'));
    layerField.appendChild(layerBox);
    var qrBox = h('div', { cls: 'qr noprint' });
    var noteBox = h('details', { cls: 'noprint' }, h('summary', { text: '病歷文字（複製貼到院內系統）' }), h('textarea', { readonly: true, text: H.note, 'aria-label': '病歷文字' }), h('button', { cls: 'btn quiet', type: 'button', text: '複製', on: { click: function () { navigator.clipboard && navigator.clipboard.writeText(H.note).then(function () { toast('已複製'); }); } } }));
    app.appendChild(noteBox); app.appendChild(qrBox); app.appendChild(incidentForm({ personId: H.pid, handoutId: H.id }));
    setBar([h('div', { cls: 'msg', text: '列印範圍在單張上方選擇。' }), h('button', { cls: 'btn ghost', type: 'button', text: '存檔並產生 QR', on: { click: function () { save(true); } } }), h('button', { cls: 'btn', type: 'button', text: '存檔並列印', on: { click: function () { save(false, true); } } })]);
    function save(qr, print) {
      api('saveHandout', { personId: H.pid, handoutId: H.id, edits: { points: E.points.filter(function (p) { return p.variant_id || p.text !== undefined || p.core !== undefined; }), hidden: E.hidden, selfWritten: E.selfWritten, layer: E.layer }, wantQr: qr })
        .then(function (r) {
          toast(r.similar_warning ? '已存檔；提醒：與上一張單張相似度偏高' : '已存檔');
          H.saved = true;
          if (r.token) {
            var url = location.origin + location.pathname.replace(/index\.html$/, '') + 'h.html#' + r.token;
            var q = qrcode(0, 'M'); q.addData(url); q.make();
            clear(qrBox).appendChild(h('img', { src: q.createDataURL(5, 8), alt: '手機版單張 QR 碼，' + Math.round((new Date(r.token_exp) - new Date()) / 60000) + ' 分鐘內有效' }));
            qrBox.appendChild(h('div', { cls: 'muted', text: '請病人用手機掃描並截圖保存；15 分鐘後失效。' }));
            qrBox.setAttribute('tabindex', '-1'); qrBox.scrollIntoView({ block: 'center' }); qrBox.focus({ preventScroll: true });
          }
          if (print) setTimeout(function () { window.print(); }, 50);
          var rn = roundNextButtons(H.pid);
          setBar([h('div', { cls: 'msg', text: '單張已存檔。' }), h('button', { cls: 'btn quiet', type: 'button', 'data-read': '1', text: '列印', on: { click: function () { window.print(); } } }), h('a', { cls: 'btn ghost', href: '#/wallet/' + H.pid, text: '隨身卡' })].concat(rn.length ? rn : [h('a', { cls: 'btn', href: '#/', text: '回今日名單' })]));
        }).catch(function (e) { fail(e, err); if (e.extra && e.extra.errors) err.appendChild(h('ul', null, e.extra.errors.map(function (x) { return h('li', { cls: 'err', text: x }); }))); });
    }
  }
  /** D48 本班病歷：逐床一段病歷文字，複製後勾已貼 */
  function notesPage(app) {
    app.appendChild(h('h1', { text: '本班病歷' }));
    app.appendChild(h('p', { cls: 'lede', text: '每位病人一段，由今天的紀錄自動產生。按「複製」後貼到院內病歷，再勾「已貼」。' }));
    var box = h('div'); app.appendChild(box);
    api('round.notes', {}).then(function (d) {
      if (d.draft_template) box.appendChild(h('p', { cls: 'alert mid', text: '草稿模板：病歷樣式（' + d.style + '）尚待本職類代表確認。' }));
      if (!d.notes.length) { box.appendChild(h('p', { cls: 'muted', text: '今天還沒有完成的接觸。' })); return; }
      var all = d.notes.map(function (n) { return '＝＝＝ ' + (n.bed ? n.bed + '床 ' : '') + (n.title || '') + ' ' + n.tail + ' ＝＝＝\n' + n.text; }).join('\n\n');
      var copy = function (t, then) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject(new Error('此瀏覽器不支援自動複製，請手動選取'))).then(function () { toast('已複製'); if (then) then(); }).catch(function (e) { toast(e.message); }); };
      var left = d.notes.filter(function (n) { return n.mark !== '已貼'; }).length;
      var sumNote = h('input', { type: 'text', id: 'sumnote', maxlength: '80' });
      box.appendChild(h('details', { cls: 'panel' }, h('summary', { text: '貼本班摘要到本職類群組（給下一班）' }), h('div', { cls: 'field' }, h('label', { for: 'sumnote', text: '補一句（選填，80 字內，不寫姓名病歷號）' }), sumNote),
        h('button', { cls: 'btn quiet', type: 'button', text: '貼到群組', on: { click: function () { api('round.summary', { note: sumNote.value }).then(function (r) { toast('已貼：' + r.text.slice(0, 30) + '…'); }).catch(fail); } } })));
      box.appendChild(h('div', { cls: 'inline' }, h('p', { cls: 'core', text: '共 ' + d.notes.length + ' 位，未貼 ' + left + ' 位' }), h('button', { cls: 'btn ghost', type: 'button', 'data-read': '1', text: '全部複製（交班用）', on: { click: function () { copy(all); } } })));
      // CL11-11：全部複製含稱謂與病歷號末四碼，貼入病歷前須逐床核對
      box.appendChild(h('p', { cls: 'hint', text: '全部複製含稱謂與病歷號末四碼，只供交班。貼入病歷時請逐位複製，並先核對床號與病人。' }));
      d.notes.forEach(function (n) {
        var ta = h('textarea', { readonly: true, cls: 'note-text', 'aria-label': '病歷文字：' + (n.title || '') + ' ' + n.tail, text: n.text });
        var mark = function (st) { api('note.mark', { encounterId: n.encounter_id, status: st }).then(function () { n.mark = st; route(); }).catch(fail); };
        box.appendChild(h('section', { cls: 'panel note-card' + (n.mark === '已貼' ? ' pasted' : '') },
          h('h2', { text: (n.bed ? n.bed + '床　' : '') + (n.title || '未填稱謂') + '　' + n.tail + '　' + n.setting + (n.result === '未能進行' ? '（未能進行）' : '') }),
          ta,
          h('div', { cls: 'inline' }, h('button', { cls: 'btn', type: 'button', text: '複製', on: { click: function () { copy(n.text, function () { if (!n.mark) mark('已複製'); }); } } }),
            h('label', { cls: 'chk' }, h('input', { type: 'checkbox', checked: n.mark === '已貼', disabled: n.mark === '已貼' ? true : null, on: { change: function (e) { if (e.target.checked) mark('已貼'); } } }), ' 已貼到院內病歷'),
            h('span', { cls: 'chip ' + (n.mark === '已貼' ? 'ok' : (n.mark ? 'new' : '')), text: n.mark || '未複製' }))));
      });
    }).catch(function (e) { fail(e, box); });
  }
  function wallet(app, pid) {
    api('walletCard', { personId: pid }).then(function (w) {
      var card = function (title, body) { return h('section', { cls: 'sheet wallet-card' }, h('h2', { text: title }), body); };
      app.appendChild(h('h1', { cls: 'noprint', text: '隨身卡' }));
      app.appendChild(card('提醒卡', h('ul', null, w.reminder.map(function (x) { return h('li', { text: x }); }))));
      if (w.goals.length) app.appendChild(card('我的目標', h('ul', null, w.goals.map(function (x) { return h('li', { text: x }); }))));
      // V30：未確認時病人端只印行政句（不新增臨床指示，臨床字句只來自內容庫）；給工作人員的提示不列印
      app.appendChild(card('生病日藥單', w.sickday.confirmed ? h('ul', null, w.sickday.items.map(function (x) { return h('li', { text: x.med + '：' + String(x.text).replace(/[。；]+$/, '') + '；' + x.resume }); })) : h('div', null, h('p', null, '這一欄還沒填寫。有問題請打電話：', h('span', { cls: 'phone', text: w.phone })), w.sickday.note ? h('p', { cls: 'hint noprint', text: '給工作人員：' + w.sickday.note }) : null)));
      app.appendChild(card('緊急聯絡', h('div', null, h('ul', null, w.emergency.l119.map(function (x) { return h('li', { cls: 'help119', text: x }); }).concat((w.emergency.led || []).map(function (x) { return h('li', { cls: 'helped', text: x }); }))), h('p', { cls: 'helpday' }, '當天聯絡：', h('span', { cls: 'phone', text: w.phone }), '（' + w.hospital + '）'))));
      setBar([h('div', { cls: 'msg', text: '列印後剪下隨身攜帶。' }), h('button', { cls: 'btn', type: 'button', 'data-read': '1', text: '列印', on: { click: function () { window.print(); } } })]);
    }).catch(function (e) { fail(e, app); });
  }

  /* ---------- 成效儀表板 ---------- */
  var DV = { view: '群體', disease: '', role: '', from: '', to: '', stratum: '', practice: false };
  function dashboard(app) {
    app.appendChild(h('h1', { text: '照護成效' }));
    var tabs = h('div', { cls: 'tabs', role: 'tablist' });
    ['群體', '疾病', '職類', '單位'].forEach(function (v) { if ((v === '職類' || v === '單位') && S.me.permission === 'L1') return; tabs.appendChild(h('button', { role: 'tab', type: 'button', 'aria-selected': String(DV.view === v), text: v, on: { click: function () { DV.view = v; route(); } } })); });
    app.appendChild(tabs);
    var ctl = h('div', { cls: 'inline filters' });
    if (DV.view === '疾病') { if (!DV.disease) DV.disease = S.info.diseases[0] && S.info.diseases[0].id; ctl.appendChild(h('div', { cls: 'field' }, h('label', { for: 'dz', text: '疾病' }), h('select', { id: 'dz', on: { change: function (e) { DV.disease = e.target.value; route(); } } }, S.info.diseases.filter(function (d) { return d.level !== '共病標記'; }).map(function (d) { return h('option', { value: d.id, selected: d.id === DV.disease, text: d.name }); })))); }
    if (DV.view === '職類') { if (!DV.role) DV.role = S.me.acting_role; ctl.appendChild(h('div', { cls: 'field' }, h('label', { for: 'rl', text: '職類' }), h('select', { id: 'rl', on: { change: function (e) { DV.role = e.target.value; route(); } } }, S.info.roles.filter(function (r) { return S.me.permission === 'L3' || S.me.roles.indexOf(r.id) >= 0; }).map(function (r) { return h('option', { value: r.id, selected: r.id === DV.role, text: r.name }); })))); }
    var f = h('input', { type: 'month', id: 'pf', value: DV.from }), t = h('input', { type: 'month', id: 'pt', value: DV.to });
    ctl.appendChild(h('div', { cls: 'field' }, h('label', { for: 'pf', text: '起' }), f));
    ctl.appendChild(h('div', { cls: 'field' }, h('label', { for: 'pt', text: '迄' }), t));
    ctl.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '快選' }), seg(['近3月', '近6月', '近12月'], null, function (v) { var n = { 近3月: 3, 近6月: 6, 近12月: 12 }[v]; var d = new Date(); DV.to = d.toISOString().slice(0, 7); d.setMonth(d.getMonth() - n + 1); DV.from = d.toISOString().slice(0, 7); route(); })));
    ctl.appendChild(h('div', { cls: 'field' }, h('label', { for: 'st', text: '分層' }), h('select', { id: 'st', on: { change: function (e) { DV.stratum = e.target.value; route(); } } }, ['', '低識能', '65歲以上', '只有照顧者', '疾病數1', '疾病數2', '疾病數3+'].map(function (s) { return h('option', { value: s, selected: s === DV.stratum, text: s || '全部' }); }))));
    if (S.me.tester || S.me.test_mode || S.me.mode !== '正式') ctl.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '資料' }), seg([{ v: '正式', t: '正式資料' }, { v: '演練', t: '演練預覽' }], DV.practice ? '演練' : '正式', function (v) { DV.practice = v === '演練'; route(); }, '', '資料來源')));
    ctl.appendChild(h('button', { cls: 'btn quiet', type: 'button', text: '套用期間', 'data-read': '1', on: { click: function () { DV.from = f.value; DV.to = t.value; route(); } } }));
    app.appendChild(ctl);
    ctl.appendChild(h('a', { cls: 'btn ghost', href: '#/report', text: '檢討會月報' }));
    var body = h('div', null, h('p', { cls: 'muted', text: '計算中…' })); app.appendChild(body);
    if (DV.view === '單位') { unitsView(body); return; }
    api('dashboard', { view: DV.view, disease: DV.disease, role: DV.role, from: DV.from, to: DV.to, stratum: DV.stratum, practice: DV.practice }).then(function (D) { renderDash(clear(body), D); }).catch(function (e) { fail(e, body); });
  }
  /** 空值只用三種寫法（9.4 第 5 點；V10） */
  function emptyText(c) { c = c || {}; if (!c.den) return c.pending ? '觀察期未屆滿' : '尚無紀錄'; if (c.masked) return '樣本不足（' + c.den + '）'; return '尚無紀錄'; }
  /** VR11R2-7：分數與空值單一寫法（「a / b」「n = b」「尚無紀錄」「樣本不足（n）」） */
  function fracText(c) { c = c || {}; var has = function (v) { return v !== null && v !== undefined; }; return has(c.num) && has(c.den) ? c.num + ' / ' + c.den : (has(c.den) ? 'n = ' + c.den : '—'); }
  function valText(c) { c = c || {}; return c.masked || c.value === null || c.value === undefined ? emptyText(c) : c.value + (c.unit === '率' ? '%' : ''); }
  function maskNote(D) { return D.masked_min > 1 ? '分母少於 ' + D.masked_min + ' 人不顯示數值' : '沒有分母時不顯示數值'; }
  /** 月報表格：表頭放 thead（跨頁重複），小表不拆頁 */
  function rtable(heads, rows, keep) { return h('table', { cls: 't' + (keep ? ' keep' : '') }, h('thead', null, h('tr', null, heads.map(function (x, i) { return h('th', { cls: i ? 'num' : '', text: x }); }))), h('tbody', null, rows)); }
  function fmt(c) { if (c.masked || c.value === null || c.value === undefined) return emptyText(c); return String(c.value); }
  /** V16：圖表標題寫發現（最大流失環節＋人數＋期間）；樣本不足時照實寫 */
  function funnelHeadline(D) {
    var f = D.funnel || [], n0 = (f[0] || {}).n || 0, w = null;
    if (n0 < D.masked_min) return '照護鏈：' + D.period.label + ' 收案 ' + n0 + ' 人，樣本不足，不判讀流失環節';
    for (var i = 1; i < f.length; i++) { var d = f[i - 1].n - f[i].n; if (d > 0 && (!w || d > w.d)) w = { d: d, a: f[i - 1], b: f[i] }; }
    return w ? '照護鏈：「' + w.a.stage + '」到「' + w.b.stage + '」流失最多（' + w.a.n + ' → ' + w.b.n + ' 人，' + D.period.label + '）' : '照護鏈：' + D.period.label + ' 收案 ' + n0 + ' 人，各環節未見流失';
  }
  function roleNm(id) { var r = ((S.info && S.info.roles) || []).filter(function (x) { return x.id === id; })[0]; return r ? r.name : (id || ''); }
  /** 窄螢幕表格改卡片：每格帶欄名（17_roster_390、公平性表） */
  function stackTable(t) { var hd = Array.prototype.map.call(t.querySelectorAll('tr:first-child th'), function (x) { return x.textContent; }); t.classList.add('stack'); Array.prototype.forEach.call(t.querySelectorAll('tr'), function (tr, i) { if (!i) return; Array.prototype.forEach.call(tr.children, function (td, j) { if (hd[j]) td.setAttribute('data-label', hd[j]); }); }); return t; }
  function unitOf(c) { return c.unit === '率' ? '%' : (c.unit === '數' ? '' : c.unit); }
  function renderDash(box, D) {
    if (D.practice) box.appendChild(h('p', { cls: 'alert practice', role: 'note', text: '演練預覽：以下只用演練病人計算，用來檢查畫面與定義，不是正式數字。' }));
    box.appendChild(layer1Panel(D));
    box.appendChild(h('p', { cls: 'muted', text: '期間 ' + D.period.label + '｜更新 ' + D.updated.slice(0, 16).replace('T', ' ') + '｜' + maskNote(D) + (D.practice ? '｜只含演練資料' : '｜演練資料不計入') }));
    var kp = h('div', { cls: 'kpis' });
    // VR11-17：尚無紀錄的卡收合成一列，不與有值卡等高並排
    var emptyCard = function (c) { var x = c.extra || {}; return (c.value === null || c.value === undefined) && !c.den && !(x.missing && x.missing.den) && !c.pending; };
    var tiles = function (ids, into) { var empties = []; ids.forEach(function (id) { var c = D.cards[id]; if (!c) return; if (emptyCard(c)) empties.push(c.name); else into.appendChild(kpiTile(c)); }); return empties; };
    var emH = tiles(D.home, kp); if (emH.length) kp.appendChild(h('p', { cls: 'muted kpi-empty', text: '尚無紀錄：' + emH.join('、') }));
    box.appendChild(kp);
    if (D.main_chart) { box.appendChild(h('h2', { text: D.main_chart.title + '（' + D.period.label + '）' })); box.appendChild(mainChart(D.main_chart)); }
    box.appendChild(h('h2', { text: funnelHeadline(D) }));
    box.appendChild(funnelChart(D.funnel));
    if (D.funnel && D.funnel[0] && D.funnel[0].excluded_new) box.appendChild(h('p', { cls: 'muted small', text: '另有 ' + D.funnel[0].excluded_new + ' 位收案未滿 ' + D.funnel[0].min_days + ' 天，尚未列入照護鏈（避免把剛收案當成流失）。各環節為巢狀計數：每一環只算通過前一環的人。' }));
    box.appendChild(h('h2', { text: '公平性：' + D.period.label + ' 主要指標分層比較（括號內 n＝分母）' }));
    box.appendChild(stackTable(h('table', { cls: 't' }, h('tr', null, h('th', { text: '指標' }), h('th', { cls: 'num', text: '全部' }), h('th', { cls: 'num', text: '低識能' }), h('th', { cls: 'num', text: '65 歲以上' }), h('th', { cls: 'num', text: '只有照顧者' })),
      D.equity.map(function (r) { var nm = (D.cards[r.id] || { name: r.id }).name; return h('tr', null, h('td', { text: nm }), h('td', { cls: 'num', text: r.all === null ? (r.all_den ? '樣本不足（' + r.all_den + '）' : '尚無紀錄') : r.all + '%（n=' + r.all_den + '）' }), r.rows.map(function (x) { return h('td', { cls: 'num', text: x.masked || x.value === null ? emptyText(x) : x.value + '%（n=' + x.den + '）' }); })); }))));
    var group = function (title, ids) { if (!ids.length) return; box.appendChild(h('h2', { text: title })); var g = h('div', { cls: 'kpis' }); var em = tiles(ids, g); if (em.length) g.appendChild(h('p', { cls: 'muted kpi-empty', text: '尚無紀錄：' + em.join('、') })); box.appendChild(g); };
    group('疾病專屬成效', D.outcomes || []);
    group('資料可信度', D.quality);
    group('平衡：指標變好的代價', D.balance);
    var pqIds = Object.keys(D.cards).filter(function (id) { return D.cards[id].family === '提問' && D.home.indexOf(id) < 0; });
    group('病人提問：病人有沒有得到答案', pqIds);
    var rest = Object.keys(D.cards).filter(function (id) { return D.home.indexOf(id) < 0 && D.quality.indexOf(id) < 0 && D.balance.indexOf(id) < 0 && (D.outcomes || []).indexOf(id) < 0 && pqIds.indexOf(id) < 0; });
    var det = h('details', null, h('summary', { text: '其他指標（' + rest.length + '）' }));
    var g2 = h('div', { cls: 'kpis' }); var em2 = tiles(rest, g2); if (em2.length) g2.appendChild(h('p', { cls: 'muted kpi-empty', text: '尚無紀錄：' + em2.join('、') })); det.appendChild(g2);
    box.appendChild(det);
    box.appendChild(actionsPanel(D));
  }
  /* ---------- D47 第一層、單位視角、改善對策、月報 ---------- */
  function layer1Panel(D) {
    var L = D.layer1 || { good: '', watch: '', trust: '', reviews: [] };
    var p = h('section', { cls: 'conc l1', 'aria-label': '本期結論' },
      h('p', null, h('b', { text: '做得好的　' }), L.good), h('p', null, h('b', { text: '要注意的　' }), L.watch), h('p', null, h('b', { text: '資料可信度　' }), L.trust));
    var rv = h('div', { cls: 'reviews' }, h('h2', { text: '建議檢討' + (L.reviews.length ? '（' + L.reviews.length + '）' : '') }));
    if (!L.reviews.length) rv.appendChild(h('p', { cls: 'muted', text: L.none || '本期沒有符合檢討規則的項目' }));
    else rv.appendChild(h('ol', null, L.reviews.map(function (r) { return h('li', null, h('div', { cls: 'rt' }, h('b', { text: r.title }), h('span', { cls: 'chip', text: ({ '照護鏈': '流失最多的環節', '推移圖訊號': '連續變化', '低於目標': '未達目標', '公平性': '族群差距' })[r.kind] || r.kind })), h('div', { text: r.text }), h('div', { cls: 'who', text: '建議找' + r.who + '討論' + (r.topic ? '：' + r.topic : '') })); })));
    rv.appendChild(h('p', { cls: 'hint', text: '建議由固定規則挑出：流失最多的環節、連續往不好方向變化的指標、未達目標的指標、不同族群差距大的指標。只指出在哪裡，不判斷原因。' }));
    return h('div', { cls: 'layer1' }, p, rv);
  }
  function unitsView(body) {
    var ids = (S.dashIds || ['M1', 'M4', 'B1', 'H1', 'H2', 'APPT1', 'MSG2', 'C2']);
    if (!DV.uind) DV.uind = 'M1';
    clear(body);
    var sel = h('select', { id: 'uind', on: { change: function (e) { DV.uind = e.target.value; unitsView(body); } } }, ids.map(function (id) { return h('option', { value: id, selected: id === DV.uind, text: id }); }));
    body.appendChild(h('div', { cls: 'field' }, h('label', { for: 'uind', text: '指標' }), sel));
    var out = h('div', null, h('p', { cls: 'muted', text: '計算中…' })); body.appendChild(out);
    api('dash.units', { indicator: DV.uind, from: DV.from, to: DV.to, practice: DV.practice }).then(function (U) {
      Array.prototype.forEach.call(sel.options, function (o) { if (o.value === U.indicator) o.textContent = U.name; });
      clear(out);
      out.appendChild(h('h2', { text: U.name + '：各單位並列（' + U.period.label + '）' }));
      out.appendChild(h('p', { cls: 'muted', text: '怎麼讀：' + U.read + '｜全部 ' + (U.all && U.all.value !== null ? U.all.value + (U.unit === '率' ? '%' : '') + '（n=' + U.all.den + '）' : '樣本不足') + '｜' + U.note + '｜' + maskNote({ masked_min: U.masked_min }) }));
      if (!U.units.length) { out.appendChild(h('p', { cls: 'muted', text: '尚無紀錄。' })); return; }
      out.appendChild(h('div', { cls: 'smalls' }, U.units.map(function (x) {
        return h('div', { cls: 'sm' }, h('div', { cls: 'nm', text: x.unit }), h('div', { cls: 'v' + (x.masked || x.value === null ? ' na' : '') }, x.masked || x.value === null ? emptyText(x) : x.value + (U.unit === '率' ? '%' : '')), h('div', { cls: 'fr', text: x.num !== null ? x.num + ' / ' + x.den : 'n = ' + x.den }), smallLine(x.series, U.axis, U.name + '，' + x.unit));
      })));
    }).catch(function (e) { fail(e, out); });
  }
  /** 小倍數：統一座標軸，單一色，點上有原生提示 */
  function smallLine(series, axis, label) {
    var W = 200, H = 64, pad = 4, base = H - 6, mn = axis[0], mx = axis[1] || 1;
    var x = function (i) { return pad + i * (W - 2 * pad) / Math.max(1, series.length - 1); }, y = function (v) { return base - (v - mn) / (mx - mn) * (base - pad); };
    var svg = h('svg', { viewBox: '0 0 ' + W + ' ' + H, cls: 'chart', role: 'img', 'aria-label': label + '，逐月走勢，座標 ' + mn + '–' + mx });
    svg.appendChild(h('line', { x1: pad, x2: W - pad, y1: base, y2: base, style: { stroke: 'var(--line-strong)' }, 'stroke-width': 1 }));
    var pts = series.map(function (s, i) { return s.value === null ? null : [x(i), y(s.value), s]; }).filter(Boolean);
    if (!pts.length) return h('p', { cls: 'muted small', text: '走勢：每月人數或同仁數不足，不畫圖' });
    if (pts.length > 1) svg.appendChild(h('polyline', { points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), fill: 'none', style: { stroke: 'var(--teal)' }, 'stroke-width': 2 }));
    pts.forEach(function (p) { var c = h('circle', { cx: p[0], cy: p[1], r: 4, style: { fill: 'var(--teal)', stroke: 'var(--surface)' }, 'stroke-width': 2 }); c.appendChild(h('title', { text: p[2].month + '：' + p[2].value + '（n=' + p[2].den + '）' })); svg.appendChild(c); });
    return h('div', { cls: 'spark' }, svg, h('div', { cls: 'spark-x' }, h('span', { text: series[0] ? series[0].month : '' }), h('span', { text: series.length ? series[series.length - 1].month : '' })));
  }
  function actionsPanel(D) {
    var box = h('section', { cls: 'actions-panel' }, h('h2', { text: '改善對策' }));
    var list = h('div'); box.appendChild(list);
    var draw = function (A) {
      clear(list);
      if (!A.rows.length) list.appendChild(h('p', { cls: 'muted', text: '還沒有對策。檢討會決定對策後在這裡登記，走勢圖會畫出起始月。' }));
      else list.appendChild(h('ul', { cls: 'list' }, A.rows.map(function (a) {
        return h('li', null, h('div', { cls: 'main' }, h('div', { cls: 't', text: a.name + '｜' + a.text }), h('div', { cls: 'muted', text: (a.problem ? a.problem + '｜' : '') + a.role_name + '負責｜自 ' + a.month + (a.due ? ' 至 ' + a.due : '') + (a.scope !== 'ALL' ? '｜範圍 ' + a.scope : '') })),
          h('span', { cls: 'chip' + (a.status === '進行中' ? ' new' : ''), text: a.status }),
          D.can_action && a.status === '進行中' ? h('button', { cls: 'btn quiet', type: 'button', text: '標為已完成', on: { click: function () { api('action.save', { id: a.id, role: a.role, status: '已完成' }).then(draw).catch(fail); } } }) : null);
      })));
    };
    api('action.list', {}).then(draw).catch(function (e) { fail(e, list); });
    if (D.can_action) {
      var v = { indicator: D.home[0] || 'M1', role: S.me.acting_role, month: D.period.to.slice(0, 7) };
      var ind = h('select', { id: 'acind', on: { change: function (e) { v.indicator = e.target.value; } } }, Object.keys(D.cards).map(function (id) { return h('option', { value: id, selected: id === v.indicator, text: D.cards[id].name }); }));
      var pr = h('input', { type: 'text', id: 'acpb', maxlength: '120' }), tx = h('input', { type: 'text', id: 'actx', maxlength: '120' }), mo = h('input', { type: 'month', id: 'acmo', value: v.month }), du = h('input', { type: 'month', id: 'acdu' });
      var rl = h('select', { id: 'acrl' }, S.info.roles.filter(function (r) { return S.me.permission === 'L3' || S.me.roles.indexOf(r.id) >= 0; }).map(function (r) { return h('option', { value: r.id, selected: r.id === v.role, text: r.name }); }));
      var msg = h('div', { 'aria-live': 'polite' });
      box.appendChild(h('details', null, h('summary', { text: '登記新對策' }),
        h('div', { cls: 'field' }, h('label', { for: 'acind', text: '指標' }), ind),
        h('div', { cls: 'field' }, h('label', { for: 'acpb', text: '問題描述（不要寫姓名與病歷號）' }), pr),
        h('div', { cls: 'field' }, h('label', { for: 'actx', text: '對策' }), tx),
        h('div', { cls: 'inline' }, h('div', { cls: 'field' }, h('label', { for: 'acrl', text: '負責職類' }), rl), h('div', { cls: 'field' }, h('label', { for: 'acmo', text: '起始月' }), mo), h('div', { cls: 'field' }, h('label', { for: 'acdu', text: '期限（選填）' }), du)),
        h('button', { cls: 'btn', type: 'button', text: '登記對策', on: { click: function () { api('action.save', { indicator: ind.value, problem: pr.value, text: tx.value, role: rl.value, month: mo.value, due: du.value }).then(function (A) { pr.value = ''; tx.value = ''; toast('已登記對策'); draw(A); }).catch(function (e) { fail(e, msg); }); } } }), msg));
    }
    return box;
  }
  function reportPage(app) {
    var m = DV.rmonth || '';
    app.appendChild(h('div', { cls: 'noprint' }, h('h1', { text: '檢討會月報' }), h('p', { cls: 'lede', text: 'A4 黑白可讀。用瀏覽器列印或另存 PDF；也可複製純文字貼到會議紀錄。' })));
    var mi = h('input', { type: 'month', id: 'rmo', value: m });
    app.appendChild(h('div', { cls: 'inline noprint' }, h('div', { cls: 'field' }, h('label', { for: 'rmo', text: '月份' }), mi), h('button', { cls: 'btn quiet', type: 'button', text: '產生', on: { click: function () { DV.rmonth = mi.value; route(); } } })));
    var out = h('div', { cls: 'report' }, h('p', { cls: 'muted', text: '計算中…' })); app.appendChild(out);
    api('dash.report', { month: m, practice: DV.practice }).then(function (R) {
      mi.value = R.month; clear(out);
      var D = R.dash, L = D.layer1;
      out.appendChild(h('h1', { text: (S.info.hospital || '') + ' 跨職類共照 檢討會月報 ' + R.month + (D.practice ? '（演練資料）' : '') }));
      out.appendChild(h('h2', { text: '一、結論' }));
      out.appendChild(h('ul', null, h('li', { text: '做得好的：' + L.good }), h('li', { text: '要注意的：' + L.watch }), h('li', { text: '資料可信度：' + L.trust })));
      out.appendChild(h('h2', { text: '二、建議檢討' }));
      out.appendChild(L.reviews.length ? h('ol', null, L.reviews.map(function (r) { return h('li', { text: r.title + '：' + r.text + '；建議找' + r.who + '討論' + (r.topic ? '（' + r.topic + '）' : '') }); })) : h('p', { text: L.none }));
      out.appendChild(h('h2', { text: '三、主指標與資料可信度' }));
      out.appendChild(rtable(['指標', '本月', '分子／分母', '較上期', '目標', '可信度', '定義版'], R.rows.map(function (r) { return h('tr', null, h('td', { text: r.name }), h('td', { cls: 'num', text: valText(r) }), h('td', { cls: 'num', text: fracText(r) }), h('td', { cls: 'num', text: r.snapshot ? '—（現況值）' : r.delta === null || r.delta === undefined ? '—' : (r.delta > 0 ? '+' : '') + r.delta }), h('td', { cls: 'num', text: r.target === null || r.target === undefined ? '—' : r.target }), h('td', { text: r.trust || '' }), h('td', { text: r.version || '' })); })));
      // VR11-15：平衡指標入月報（避免只看主指標而忽略病人負荷等副作用）
      var bal = (D.balance || []).map(function (id) { return D.cards[id]; }).filter(Boolean);
      if (bal.length) {
        out.appendChild(h('h3', { text: '平衡指標（監看副作用，不設目標）' }));
        out.appendChild(rtable(['指標', '本月', '分子／分母', '較上期'], bal.map(function (c) { return h('tr', null, h('td', { text: c.name }), h('td', { cls: 'num', text: valText(c) }), h('td', { cls: 'num', text: fracText(c) }), h('td', { cls: 'num', text: c.delta === null || c.delta === undefined ? '—' : (c.delta > 0 ? '+' : '') + c.delta })); }), true));
      }
      out.appendChild(h('h2', { text: '四、照護鏈' }));
      out.appendChild(h('p', { text: (D.funnel || []).map(function (f) { return f.stage + ' ' + f.n; }).join(' → ') + (D.funnel && D.funnel[0] && D.funnel[0].excluded_new ? '。另有 ' + D.funnel[0].excluded_new + ' 位收案未滿 ' + D.funnel[0].min_days + ' 天，未列入' : '') }));
      out.appendChild(h('h2', { text: '五、公平性' }));
      out.appendChild(h('ul', null, D.equity.map(function (e) { return h('li', { text: ((D.cards[e.id] || {}).name || e.id) + '：全部' + (e.all === null ? (e.all_den ? '樣本不足（' + e.all_den + '）' : '尚無紀錄') : ' ' + e.all + '%') + '；' + e.rows.map(function (x) { return x.stratum + '：' + valText(Object.assign({ unit: '率' }, x)); }).join('、') }); })));
      out.appendChild(h('h2', { text: '六、進行中對策' }));
      out.appendChild(R.actions.length ? h('ul', null, R.actions.map(function (a) { return h('li', { text: a.name + '｜' + a.text + '｜' + a.role_name + '｜自 ' + a.month + (a.effect.before && a.effect.after ? '｜前 ' + a.effect.before.value + ' → 後 ' + a.effect.after.value : '｜前後資料不足') }); })) : h('p', { text: '（無）' }));
      if (R.pq) {
        out.appendChild(h('h2', { text: '七、病人最常問、我們答不出來的主題' }));
        out.appendChild(R.pq.gaps.length ? h('ol', null, R.pq.gaps.map(function (g) { return h('li', { text: g.label + '：' + g.n + ' 次' }); })) : h('p', { text: '（本月沒有答不出來的提問）' }));
        out.appendChild(h('p', { text: '搜尋找不到的字詞：' + (R.pq.words.length ? R.pq.words.map(function (w) { return w.word + '（' + w.n + '）'; }).join('、') : '（無）') }));
        if (R.pq.flow.length) out.appendChild(rtable(['提問職類', '主責職類', '件數'], R.pq.flow.map(function (f) { return h('tr', null, h('td', { text: f.from }), h('td', { text: f.to }), h('td', { cls: 'num', text: f.n === null ? '少於 ' + R.pq.masked_min : String(f.n) })); }), true));
      }
      out.appendChild(h('p', { cls: 'small', text: '限制：數字由系統帳本計算，只含使用本系統的照護紀錄；' + maskNote(D) + '；對策前後比較未控制其他因素，不能推論因果。' }));
      setBar([h('button', { cls: 'btn ghost', type: 'button', text: '複製純文字', on: { click: function () { navigator.clipboard.writeText(R.text).then(function () { toast('已複製純文字摘要'); }).catch(function () { toast('無法複製，請手動選取'); }); } } }), h('button', { cls: 'btn', type: 'button', text: '列印或存 PDF', on: { click: function () { window.print(); } } })]);
    }).catch(function (e) { fail(e, out); });
  }
  function kpiTile(c) {
    var tile = h('div', { cls: 'kpi' });
    tile.appendChild(h('div', { cls: 'nm', text: c.name }));
    var na = c.masked || c.value === null || c.value === undefined;
    tile.appendChild(h('div', { cls: 'v' + (na ? ' na' : '') }, fmt(c), !na ? h('small', { text: unitOf(c) }) : null));
    tile.appendChild(h('div', { cls: 'fr', text: c.masked ? 'n = ' + c.den : (c.num !== null && c.den !== null ? c.num + ' / ' + c.den : (c.den !== null ? 'n = ' + c.den + (c.p90 ? '｜P90 ' + c.p90 : '') : '')) + (c.pending ? '｜觀察期未屆滿 ' + c.pending : '') + (c.target ? '｜目標 ' + c.target.value : '') }));
    var x = c.extra || {};
    if (x.improved !== undefined && !c.masked) tile.appendChild(h('div', { cls: 'fr', text: '改善 ' + x.improved + '｜持平 ' + x.same + '｜惡化 ' + x.worse + '｜未配對 ' + x.unpaired }));
    if (x.baseline_best !== undefined && !c.masked && x.baseline_best) tile.appendChild(h('div', { cls: 'fr', text: '基線已最佳（不入分母）' + x.baseline_best + (x.baseline_best_worse ? '，其中變差 ' + x.baseline_best_worse : '') }));
    if (x.taught !== undefined && !c.masked) tile.appendChild(h('div', { cls: 'fr', text: x.taught_masked ? '受教者掌握：樣本不足（' + x.taught + '）' : '受教者掌握 ' + x.taught_met + ' / ' + x.taught + '｜未教 ' + x.not_taught }));
    if (x.missing && x.missing.den) tile.appendChild(h('div', { cls: 'fr', text: x.missing.masked ? '應量未量：樣本不足（' + x.missing.den + '）' : '應量未量 ' + x.missing.num + ' / ' + x.missing.den }));
    if (x.source) tile.appendChild(h('div', { cls: 'fr', text: x.source }));
    var cmp = [];
    if (c.delta !== null && c.delta !== undefined) cmp.push((c.delta > 0 ? '↑ 比上期高 ' : c.delta < 0 ? '↓ 比上期低 ' : '＝ 與上期相同') + (c.delta ? Math.abs(c.delta) : '') + (c.better === true ? '（變好）' : c.better === false ? '（變差）' : ''));
    else if (!na && !c.snapshot) cmp.push('上期樣本不足，無法比較');
    if (c.gap !== null && c.gap !== undefined) cmp.push(c.below ? '未達目標（差 ' + Math.abs(c.gap) + '）' : '已達目標');
    if (cmp.length) tile.appendChild(h('div', { cls: 'cmp', text: cmp.join('｜') }));
    if (c.trust && (c.den || c.unit === '數')) tile.appendChild(h('div', { cls: 'trust t-' + c.trust, text: '資料可信度：' + c.trust }));
    if (c.signal) tile.appendChild(h('div', { cls: 'sig', text: c.signal.rule + '（' + c.signal.direction + '）' }));
    tile.appendChild(c.snapshot ? h('p', { cls: 'muted small', text: '現況值（以今天計），不畫逐月推移、不與上期比較' }) : spark(c.series, c.target, c.unit, c.actions));
    if ((c.actions || []).length) tile.appendChild(h('div', { cls: 'acts', text: c.actions.map(function (x) { return '對策自 ' + x.month + '：' + x.text + '（' + x.status + '）'; }).join('；') }));
    if (c.read) tile.appendChild(h('p', { cls: 'read', text: '怎麼讀：' + c.read }));
    tile.appendChild(h('button', { cls: 'def', type: 'button', text: '定義與逐月數字', on: { click: function () { showDef(c); } } }));
    return tile;
  }
  function showDef(c) {
    var dlg = h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': c.name + ' 定義', cls: 'panel', style: { position: 'fixed', inset: '10% 5% auto 5%', zIndex: '60', maxHeight: '75vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(24,38,46,.25)' } },
      h('h3', { text: c.name + '（定義第 ' + c.version + ' 版）' }), h('p', { text: '分子：' + c.numDef }), h('p', { text: '分母：' + c.denDef }),
      h('table', { cls: 't' }, h('tr', null, h('th', { text: '月份' }), h('th', { cls: 'num', text: '分子' }), h('th', { cls: 'num', text: '分母' }), h('th', { cls: 'num', text: '值' })), c.series.map(function (s) { return h('tr', null, h('td', { text: s.month }), h('td', { cls: 'num', text: s.num === null ? '—' : s.num }), h('td', { cls: 'num', text: s.den === null ? '—' : s.den }), h('td', { cls: 'num', text: s.value === null ? '—' : s.value })); })),
      h('button', { cls: 'btn', type: 'button', text: '關閉', on: { click: function () { dlg.remove(); } } }));
    var opener = document.activeElement;
    var close = function () { dlg.remove(); document.removeEventListener('keydown', onKey); if (opener && opener.focus) opener.focus(); };
    var onKey = function (e) { if (e.key === 'Escape') close(); if (e.key === 'Tab') { var f = dlg.querySelectorAll('button, a[href], [tabindex]'); if (f.length) { var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } } };
    dlg.querySelector('button').onclick = close; document.addEventListener('keydown', onKey);
    document.body.appendChild(dlg); dlg.querySelector('button').focus();
  }
  /** 推移圖：率值軸固定 0–100（不放大小幅變動）；中位數中心線；首末月標籤與圖例（V09） */
  function spark(series, target, unit, actions) {
    var W = 200, H = 58, pad = 4, base = H - 14;
    var vals = series.map(function (s) { return s.value; }).filter(function (v) { return v !== null; });
    var wrap = h('div', { cls: 'spark' });
    var svg = h('svg', { viewBox: '0 0 ' + W + ' ' + H, cls: 'chart', role: 'img', 'aria-label': '逐月推移圖，' + vals.length + ' 個月有資料' });
    wrap.appendChild(svg);
    var hasDen = series.filter(function (s) { return s.den; }).length;
    // 空狀態一致：逐月分母是當月人數，與期間不重複人數不同，故寫明「每月都少於門檻」
    if (vals.length < 2) { wrap.removeChild(svg); wrap.appendChild(h('p', { cls: 'muted small', text: vals.length ? '趨勢：只有 1 個月人數足夠，暫不畫線' : (hasDen ? '趨勢：' + hasDen + ' 個月有紀錄，但每月人數都少於顯示門檻' : '趨勢：尚無紀錄') })); return wrap; }
    var rate = unit === '率', all = vals.concat(target ? [target.value] : []);
    var mn = rate ? 0 : Math.min(0, Math.min.apply(null, all)), mx = rate ? 100 : Math.max.apply(null, all);
    if (mx === mn) mx = mn + 1;
    var x = function (i) { return pad + i * (W - 2 * pad) / Math.max(1, series.length - 1); }, y = function (v) { return base - (v - mn) / (mx - mn) * (base - pad); };
    var sorted = vals.slice().sort(function (a, b) { return a - b; }), mid = Math.floor(sorted.length / 2);
    var med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    svg.appendChild(h('line', { x1: pad, x2: W - pad, y1: base, y2: base, style: { stroke: 'var(--line-strong)' }, 'stroke-width': 1 }));
    svg.appendChild(h('line', { x1: pad, x2: W - pad, y1: y(med), y2: y(med), style: { stroke: 'var(--ink-3)' }, 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
    if (target) svg.appendChild(h('line', { x1: pad, x2: W - pad, y1: y(target.value), y2: y(target.value), style: { stroke: 'var(--amber)' }, 'stroke-width': 1 }));
    var pts = series.map(function (s, i) { return s.value === null ? null : x(i) + ',' + y(s.value); }).filter(Boolean).join(' ');
    svg.appendChild(h('polyline', { points: pts, fill: 'none', style: { stroke: 'var(--teal)' }, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    var marks = (actions || []).map(function (a) { var i = series.map(function (s) { return s.month; }).indexOf(a.month); return i >= 0 ? { i: i, a: a } : null; }).filter(Boolean);
    marks.forEach(function (m) { svg.appendChild(h('line', { x1: x(m.i), x2: x(m.i), y1: pad, y2: base, style: { stroke: 'var(--ink-2)' }, 'stroke-width': 1.5 })); });
    var lastI = series.map(function (s) { return s.value; }).lastIndexOf(vals[vals.length - 1]);
    svg.appendChild(h('circle', { cx: x(lastI), cy: y(vals[vals.length - 1]), r: 3, style: { fill: 'var(--teal)' } }));
    // 月份改以 HTML 顯示（SVG 縮放後字太小）
    wrap.appendChild(h('div', { cls: 'spark-x' }, h('span', { text: String(series[0].month || '') }), h('span', { text: String(series[series.length - 1].month || '') })));
    wrap.appendChild(h('div', { cls: 'legend' }, h('span', { text: '軸 ' + mn + '–' + mx + (rate ? '%' : '') }), h('span', { text: '虛線＝中位數 ' + Math.round(med * 10) / 10 }), target ? h('span', { text: '褐線＝目標' }) : null, marks.length ? h('span', { text: '直線＝對策起始（' + marks.map(function (m) { return m.a.month; }).join('、') + '）' }) : null));
    return wrap;
  }
  /** 橫條（HTML，字級隨版面，手機可讀；V11）：每列標名稱與人數 */
  function funnelChart(f) {
    var max = Math.max.apply(null, f.map(function (x) { return x.n; }).concat([1]));
    return h('div', { cls: 'hbars', role: 'list', 'aria-label': f.map(function (x) { return x.stage + ' ' + x.n + ' 人'; }).join('，') }, f.map(function (s, i) {
      var prev = i ? f[i - 1].n : null, drop = prev ? prev - s.n : 0;
      return h('div', { cls: 'hbar', role: 'listitem' }, h('span', { cls: 'hb-l', text: s.stage }),
        h('span', { cls: 'hb-t' }, s.n ? h('span', { cls: 'hb-f' + (i === 0 ? ' first' : ''), style: { width: Math.max(1, Math.round(s.n / max * 100)) + '%' } }) : null),
        h('span', { cls: 'hb-v', text: s.n + ' 人' + (prev && drop > 0 ? '（少 ' + drop + '）' : '') }));
    }));
  }
  /** 掌握層級堆疊（HTML）：每段印人數，不單靠顏色；小樣本列遮蔽（V08、V13） */
  function mainChart(m) {
    if (m.kind === '階梯' || m.kind === '照顧者掌握' || m.kind === '求助掌握' || m.kind === '項目掌握') {
      if (!m.rows.length) return h('p', { cls: 'muted', text: '尚無紀錄' });
      var rows = m.rows.map(function (r) {
        var tot = (r.counts || []).reduce(function (a, c) { return a + c; }, 0);
        if (r.masked || !tot) return h('div', { cls: 'hbar' }, h('span', { cls: 'hb-l', text: r.label + '（' + (r.n || 0) + ' 人）' }), h('span', { cls: 'hb-t na', text: r.masked ? '樣本不足' : '尚無紀錄' }));
        return h('div', { cls: 'hbar' }, h('span', { cls: 'hb-l', text: r.label + '（' + tot + ' 人）' }),
          h('span', { cls: 'hb-t stack' }, r.counts.map(function (c, j) { return c ? h('span', { cls: 'lv lv' + j, style: { width: (c / tot * 100) + '%' }, title: m.levels[j] + ' ' + c + ' 人', text: (c / tot >= 0.12 ? m.levels[j].slice(0, 2) + ' ' : '') + c }) : null; })));
      });
      var lg = h('div', { cls: 'legend' }, m.levels.map(function (l, j) { return h('span', null, h('i', { cls: 'lv lv' + j }), l); }), h('span', { text: '段內數字＝人數' }));
      return h('div', null, h('div', { cls: 'hbars' }, rows), lg);
    }
    if (m.kind === '停復藥漏斗') return funnelChart(m.stages.map(function (s) { return { stage: s.stage, n: s.n }; }));
    if (m.kind === '職類參與' || m.kind === '裝置步驟') return funnelChart((m.rows || []).map(function (r) { return { stage: r.label, n: r.n }; }));
    if (m.kind === '面向涵蓋' && !(m.rows || []).length) return h('p', { cls: 'muted', text: '尚無紀錄' });
    if (m.kind === '面向涵蓋') return h('table', { cls: 't' }, h('tr', null, h('th', { text: '主題' }), h('th', { cls: 'num', text: '已涵蓋' }), h('th', { cls: 'num', text: '應涵蓋' })), m.rows.map(function (r) { return h('tr', null, h('td', { text: r.label }), h('td', { cls: 'num', text: r.cov }), h('td', { cls: 'num', text: r.slots })); }));
    if (m.kind === '要素前後配對') {
      if (m.masked) return h('p', { cls: 'muted', text: '樣本不足（' + m.n + '）。' });
      var W2 = 720, H2 = m.pairs.length * 18 + 30, all = m.pairs.reduce(function (a, p) { return a.concat([p.first, p.last]); }, []), mx2 = Math.max.apply(null, all.concat([1]));
      var s2 = h('svg', { viewBox: '0 0 ' + W2 + ' ' + H2, cls: 'chart', role: 'img', 'aria-label': m.title });
      m.pairs.forEach(function (p, i) { var y0 = i * 18 + 10, xs = function (v) { return 40 + v / mx2 * (W2 - 80); }; s2.appendChild(h('line', { x1: xs(p.first), x2: xs(p.last), y1: y0, y2: y0, stroke: '#9DC6BF', 'stroke-width': 2 })); s2.appendChild(h('circle', { cx: xs(p.first), cy: y0, r: 4, fill: '#D3DAD7' })); s2.appendChild(h('circle', { cx: xs(p.last), cy: y0, r: 4, fill: '#0D6B66' })); });
      return h('div', null, s2, h('div', { cls: 'legend' }, h('span', { text: '灰點：首次；深綠：最近一次' })));
    }
    return h('p', { cls: 'muted', text: '尚無紀錄。' });
  }
  function mine(app) {
    app.appendChild(h('h1', { text: '我的數字' }));
    app.appendChild(h('p', { cls: 'lede', text: '只有您看得到。旁邊是同職類的群體值；分母少於門檻不顯示，也不和個人比較。' }));
    api('myStats', {}).then(function (d) {
      app.appendChild(h('table', { cls: 't' }, h('tr', null, h('th', { text: '指標' }), h('th', { cls: 'num', text: '我' }), h('th', { cls: 'num', text: '同職類群體' })), d.rows.map(function (r) { var m = r.mine; return h('tr', null, h('td', { text: r.name }), h('td', { cls: 'num', text: !m || m.masked || m.value === null ? emptyText(m) : m.value }), h('td', { cls: 'num', text: r.role_value === null ? '尚無紀錄' : r.role_value })); })));
    }).catch(function (e) { fail(e, app); });
  }
  function teaching(app) {
    app.appendChild(h('h1', { text: '教學成效' }));
    app.appendChild(h('p', { cls: 'lede', text: '新進同仁的首講通過率與進步曲線，只給本人與指定的指導者。' }));
    api('teaching', {}).then(function (d) {
      if (!d.people.length) app.appendChild(h('p', { cls: 'muted', text: '您不是新進同仁，也沒有被指定為指導者。' }));
      d.people.forEach(function (p) {
        var c = { series: p.curve.map(function (x) { return { value: x.value }; }) };
        app.appendChild(h('section', { cls: 'panel' }, h('h3', { text: p.name + (p.self ? '（我）' : '') }), h('p', { text: '首講通過率：' + (p.T1 && !p.T1.masked && p.T1.value !== null ? p.T1.value + '%' : '樣本不足') + '｜焦點改選率：' + (p.T2 && !p.T2.masked && p.T2.value !== null ? p.T2.value + '%' : '樣本不足') }), spark(c.series)));
      });
    }).catch(function (e) { fail(e, app); });
  }

  /* ---------- 名單管理（D38） ---------- */
  function roster(app) {
    app.appendChild(h('h1', { text: '名單管理' }));
    app.appendChild(h('p', { cls: 'lede', text: S.me.permission === 'L3' ? '您是系統管理者，可管理所有職類並指派職類管理員。' : '您可以新增、停用本職類的同仁，設定新進與指導者。' }));
    var form = h('section', { cls: 'panel' }), list = h('div');
    app.appendChild(form); app.appendChild(list);
    function edit(s) {
      var v = s ? JSON.parse(JSON.stringify(s)) : { email: '', name: '', unit: '', roles: [S.me.roles[0]], permission: 'L1', tester: false, novice: false, mentor: '', scope: ['ALL'] };
      var orig = s ? s.email.split(';')[0].trim() : '';
      clear(form).appendChild(h('h2', { text: s ? '修改：' + s.name : '新增同仁' }));
      var em = h('input', { type: 'email', id: 're', value: v.email.split(';')[0].trim() }), nm = h('input', { type: 'text', id: 'rn', value: v.name }), un = h('input', { type: 'text', id: 'ru', value: v.unit || '' }), mt = h('input', { type: 'email', id: 'rm', value: v.mentor || '' });
      var roleBox = h('div'), scopeBox = h('div'), flags = h('div');
      var allowed = S.me.permission === 'L3' ? S.info.roles.map(function (r) { return r.id; }) : S.me.roles;
      function re() {
        clear(roleBox).appendChild(seg(S.info.roles.filter(function (r) { return allowed.indexOf(r.id) >= 0; }).map(function (r) { return { v: r.id, t: r.name }; }), v.roles, function (x) { var i = v.roles.indexOf(x); if (i >= 0 && v.roles.length > 1) v.roles.splice(i, 1); else if (i < 0) v.roles.push(x); re(); }, '', '職類'));
        clear(scopeBox).appendChild(seg([{ v: 'ALL', t: '全部疾病（統包）' }].concat(S.info.diseases.filter(function (d) { return d.level !== '共病標記'; }).map(function (d) { return { v: d.id, t: d.name }; })), v.scope, function (x) { if (x === 'ALL') v.scope = ['ALL']; else { v.scope = v.scope.filter(function (y) { return y !== 'ALL'; }); var i = v.scope.indexOf(x); if (i >= 0) v.scope.splice(i, 1); else v.scope.push(x); if (!v.scope.length) v.scope = ['ALL']; } re(); }, '', '照護範圍'));
        clear(flags).appendChild(h('label', { cls: 'chk' }, h('input', { type: 'checkbox', checked: v.novice, on: { change: function (e) { v.novice = e.target.checked; } } }), ' 新進（預設展開講稿與判準）'));
        if (S.me.permission === 'L3') { flags.appendChild(h('label', { cls: 'chk', style: { marginLeft: '16px' } }, h('input', { type: 'checkbox', checked: v.tester, on: { change: function (e) { v.tester = e.target.checked; } } }), ' 測試員')); flags.appendChild(seg([{ v: 'L1', t: '一般' }, { v: 'L2', t: '職類管理員' }, { v: 'L3', t: '系統管理者' }], v.permission, function (x) { v.permission = x; re(); }, '', '權限')); }
      }
      re();
      var err = h('div');
      form.appendChild(h('div', { cls: 'inline' }, h('div', { cls: 'field' }, h('label', { for: 're', text: '電郵（Google 帳號）' }), em), h('div', { cls: 'field' }, h('label', { for: 'rn', text: '姓名' }), nm), h('div', { cls: 'field' }, h('label', { for: 'ru', text: '單位' }), un)));
      form.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '職類' }), roleBox));
      form.appendChild(h('div', { cls: 'field' }, h('span', { cls: 'lab', text: '照護範圍' }), scopeBox, h('div', { cls: 'hint', text: '專責某疾病者選該疾病；其餘選全部。開啟任何病人都不受範圍限制。' })));
      form.appendChild(flags);
      form.appendChild(h('div', { cls: 'field' }, h('label', { for: 'rm', text: '指導者電郵（新進時填）' }), mt));
      form.appendChild(h('button', { cls: 'btn', type: 'button', text: s ? '儲存修改' : '新增', on: { click: function () { api('roster.upsert', { originalEmail: orig, email: em.value.trim(), name: nm.value, unit: un.value, roles: v.roles, scope: v.scope, novice: v.novice, mentor: mt.value, tester: v.tester, permission: v.permission }).then(function () { toast(s ? '已修改' : '已新增，對方即可登入'); load(); edit(null); }).catch(function (e) { fail(e, err); }); } } }));
      if (s) form.appendChild(h('button', { cls: 'btn ghost', type: 'button', text: '取消', on: { click: function () { edit(null); } } }));
      form.appendChild(err);
    }
    function roleName(id) { var r = S.info.roles.filter(function (x) { return x.id === id; })[0]; return r ? r.name : id; }
    function dzName(id) { var r = S.info.diseases.filter(function (x) { return x.id === id; })[0]; return r ? r.name : '（未知疾病代碼）'; }
    function load() {
      api('roster.list', {}).then(function (d) {
        clear(list).appendChild(stackTable(h('table', { cls: 't roster' }, h('tr', null, ['姓名', '電郵', '職類', '範圍', '權限', '狀態', ''].map(function (x) { return h('th', { text: x }); })),
          d.staff.map(function (s) { return h('tr', null, h('td', { text: s.name + (s.novice ? '（新進）' : '') }), h('td', { text: s.email }), h('td', { text: s.roles.map(roleName).join('、') }), h('td', { text: s.scope.map(function (x) { return x === 'ALL' ? '全部疾病' : dzName(x); }).join('、') }), h('td', { text: ({ L1: '一般', L2: '職類管理員', L3: '系統管理者' }[s.permission] || s.permission) + (s.tester ? '｜測試員' : '') }), h('td', { text: s.status + (s.bound ? '' : '｜未登入過') }),
            h('td', null, h('button', { cls: 'btn quiet', type: 'button', text: '修改', on: { click: function () { edit(s); } } }), h('button', { cls: 'btn quiet', type: 'button', text: s.status === '啟用' ? '停用' : '啟用', on: { click: function () { api('roster.setStatus', { email: s.email.split(';')[0].trim(), status: s.status === '啟用' ? '停用' : '啟用' }).then(load).catch(fail); } } }))); }))));
      }).catch(function (e) { fail(e, list); });
    }
    edit(null); load();
  }
  /** v1.4.1（CT140-001）簽核確認：只有登入者本人能確認；簽核者姓名由後端依登入身分寫入，畫面不收姓名或日期 */
  function signPage(app) {
    app.appendChild(h('h1', { text: '簽核確認' }));
    app.appendChild(h('p', { cls: 'lede', text: '這裡列出已匯入、等待確認的內容。按下確認，系統會用您目前登入的身分簽核；內容若在匯入後被改過，該列自動失效。' }));
    var box = h('div'); app.appendChild(box);
    function load() {
      api('sign.pending', {}).then(function (d) {
        clear(box);
        if (!d.batches.length) { box.appendChild(h('p', { cls: 'hint', text: '目前沒有待確認的簽核。' })); return; }
        d.batches.forEach(function (b) {
          var sec = h('section', { cls: 'panel sign-batch' });
          var risk = Object.keys(b.by_risk).map(function (k) { return k + ' ' + b.by_risk[k]; }).join('、');
          sec.appendChild(h('h3', { text: '批次 ' + b.batch_id + '：共 ' + b.n + ' 列，您可確認 ' + b.mine + ' 列' }));
          sec.appendChild(h('p', { cls: 'hint', text: '風險：' + risk + (b.need2 ? '。其中 ' + b.need2 + ' 列需要兩位不同同仁確認（已有一人確認 ' + b.waiting2 + ' 列）。' : '。') }));
          var det = h('details', null, h('summary', { text: '逐列內容（' + b.rows.length + ' 列）' }));
          det.appendChild(stackTable(h('table', { cls: 't' }, h('tr', null, ['鍵', '裁決', '風險', '職類', '內容', ''].map(function (x) { return h('th', { text: x }); })),
            b.rows.map(function (r) { return h('tr', null, h('td', { text: r.key }), h('td', { text: r.verdict }), h('td', { text: r.risk + (r.need2 ? '（雙簽）' : '') }), h('td', { text: r.roles || '—' }), h('td', null, h('pre', { cls: 'sign-pre', text: r.preview })), h('td', { text: r.first })); }))));
          sec.appendChild(det);
          if (b.mine) {
            var btn = h('button', { cls: 'btn', type: 'button', text: '以我的登入身分確認這 ' + b.mine + ' 列', on: { click: function () {
              btn.disabled = true;
              api('sign.confirm', { batchId: b.batch_id }, { idemKey: uid() }).then(function (r) {
                toast('已套用 ' + r.applied + ' 列' + (r.waiting2 ? '；' + r.waiting2 + ' 列等第二位確認' : '') + (r.stale ? '；' + r.stale + ' 列因內容變更失效' : '') + (r.skipped ? '；略過 ' + r.skipped + ' 列' : ''));
                load();
              }).catch(function (e) { btn.disabled = false; fail(e, sec); });
            } } });
            sec.appendChild(btn);
          }
          box.appendChild(sec);
        });
      }).catch(function (e) { fail(e, box); });
    }
    load();
  }
  function admin(app) {
    app.appendChild(h('h1', { text: '系統狀態' }));
    api('admin.selfcheck', {}).then(function (r) { app.appendChild(h('section', { cls: 'panel' }, h('h3', { text: '部署檢查' }), h('ul', null, r.lines.map(function (l) { return h('li', { text: l }); })))); return api('admin.dictReport', {}); })
      .then(function (d) { app.appendChild(h('section', { cls: 'panel' }, h('h3', { text: '字典自檢：錯誤 ' + d.errors.length + '、警告 ' + d.warnings.length }),
        d.warnings.length > 50 ? h('p', { cls: 'hint', text: '錯誤全部列出；警告只顯示前 50 筆（共 ' + d.warnings.length + ' 筆），完整清單見內容建置報告。' }) : null,
        h('ul', null, d.errors.concat(d.warnings.slice(0, 50)).map(function (l) { return h('li', { text: l }); })))); })
      .catch(function (e) { fail(e, app); });
  }

  /* ---------- 啟動 ---------- */
  if (!CFG.apiUrl) { clear($('app')).appendChild(h('p', { cls: 'alert high', text: '尚未設定 config.js（apiUrl）。請依部署指南填寫。' })); return; }
  showLogin();
})();
