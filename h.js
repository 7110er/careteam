/* QR 手機版單張：免登入、不含姓名與病歷號；連結 15 分鐘失效（請截圖保存） */
(function () {
  'use strict';
  var CFG = window.CARETEAM_CONFIG || {};
  var app = document.getElementById('app');
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { var v = attrs[k]; if (v == null || v === false) return; if (k === 'text') el.textContent = v; else if (k === 'cls') el.className = v; else if (k === 'on') Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); }); else el.setAttribute(k, v === true ? '' : v); });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); }
    return el;
  }
  var token = (location.hash || '').slice(1);
  history.replaceState(null, '', location.pathname); // 不在網址列與歷史保留權杖
  function post(action, payload) {
    return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: payload, clientVersion: CFG.clientVersion || '1.0.0' }) }).then(function (r) { return r.json(); });
  }
  function msg(t) { while (app.firstChild) app.removeChild(app.firstChild); app.appendChild(h('div', { cls: 'sheet large' }, h('p', { text: t }))); }
  if (!/^[a-f0-9]{40}$/.test(token)) { msg('連結無效。請向照護人員索取紙本單張。'); return; }
  post('publicHandout', { token: token }).then(function (r) {
    if (!r.ok) { msg(r.error.message); return; }
    var D = r.data.handout, hid = function (k) { return !!D['hidden_' + k]; }, U = function (k, d) { return (D.ui && D.ui[k]) || d; };
    var s = h('article', { cls: 'sheet large' });
    s.appendChild(h('h1', { text: '今天的照護重點' }));
    s.appendChild(h('p', { cls: 'muted', text: D.hospital + '｜' + D.date + '｜' + D.role }));
    s.appendChild(h('p', { cls: 'alert info', text: '這個網頁 15 分鐘後會失效，請現在截圖保存。' }));
    if (!hid('points') && D.points.length) s.appendChild(h('section', null, h('h2', { text: '這次的重點' }), D.points.map(function (p) { return h('div', null, p.core ? h('p', { cls: 'core', text: p.core }) : null, p.keypoint && !p.text && p.keypoint !== p.core ? h('p', { text: p.keypoint }) : null, p.text ? h('p', { text: p.text }) : null, p.also ? h('p', { cls: 'muted', text: p.also }) : null); })));
    if (!hid('known') && D.known.length) s.appendChild(h('section', null, h('h2', { text: '您已經會的' }), h('ul', null, D.known.map(function (x) { return h('li', { text: x }); }))));
    if (!hid('meds') && D.meds.length) s.appendChild(h('section', null, h('h2', { text: '我的藥' }), D.meds.map(function (m) { return h('div', null, h('p', { cls: 'core', text: m.name }), h('p', { text: '為什麼吃：' + m.why }), h('p', { text: '怎麼吃：' + m.how }), m.discomfort ? h('p', { text: '可能不舒服：' + String(m.discomfort).replace(/[。；]+$/, '') + (m.selfcare ? '；' + m.selfcare : '') }) : null, m.urgent ? h('p', { cls: 'help119', text: m.urgent }) : null, m.sickday ? h('p', { text: '生病時：' + m.sickday }) : null, m.missed ? h('p', { text: '忘記吃：' + m.missed }) : null, m.avoid ? h('p', { text: '要避免：' + m.avoid }) : null); })));
    if (!hid('life') && D.life.length) s.appendChild(h('section', null, h('h2', { text: '吃喝與活動' }), h('ul', null, D.life.map(function (l) { return h('li', { text: (l.core ? l.core + '：' : '') + l.text }); }))));
    if (!hid('asked') && D.asked && D.asked.length) s.appendChild(h('section', null, h('h2', { text: (D.ui && D.ui.PQ_HANDOUT_HEAD) || '您問的問題' }), h('ul', null, D.asked.map(function (x) { return h('li', null, x.q ? h('div', null, h('b', { text: x.q })) : null, [x.a, x.next].filter(Boolean).join('')); }))));
    if (!hid('deliver') && D.deliver && D.deliver.length) s.appendChild(h('section', null, h('h2', { text: D.certainty === '已約下次' ? '帶回家看，下次請您說說看' : '帶回家看的' }), h('ul', null, D.deliver.map(function (x) { return h('li', { text: x }); }))));
    if (!hid('ask_next') && D.ask_next && D.ask_next.length) s.appendChild(h('section', null, h('h2', { text: '下次我們會請您說說看的' }), h('ul', null, D.ask_next.map(function (x) { return h('li', { text: x }); }))));
    if (D.todo.length) s.appendChild(h('section', null, h('h2', { text: '回家做的一件事' }), h('p', { cls: 'core', text: D.todo[0] })));
    s.appendChild(h('section', null, h('h2', { text: '什麼時候要求助' }), D.help.l119.length ? h('div', null, h('p', { cls: 'help119', text: U('HEAD_119', '立刻撥 119') }), h('ul', null, D.help.l119.map(function (x) { return h('li', { cls: 'help119', text: x }); }))) : null, (D.help.led || []).length ? h('div', null, h('p', { cls: 'helped', text: U('HEAD_ED', '立刻去急診') }), h('ul', null, D.help.led.map(function (x) { return h('li', { cls: 'helped', text: x }); }))) : null, h('p', { cls: 'helpday' }, U('HEAD_DAY', '當天就要處理') + '，電話：', h('a', { href: 'tel:' + String(D.phone).replace(/[^0-9+]/g, ''), cls: 'phone', text: D.phone })), h('ul', null, D.help.lday.map(function (x) { return h('li', { text: x }); }))));
    // 下次見面（8.1 必印；V06）
    if (D.next) { var NA = D.next.appt; s.appendChild(h('section', null, h('h2', { text: '下次見面' }),
      h('p', { text: NA ? NA.date + ' ' + NA.slot + (NA.time ? ' ' + NA.time : '') + (NA.place && !NA.phone ? '，' + NA.place : '') + '，' + NA.role + (NA.how || '和您見面') : (D.next.roles && D.next.roles.length ? D.next.roles.join('、') + U('NEXT_ROLES', '會再和您談') : U('NEXT_NONE', '依醫師安排回診')) }),
      NA && NA.bring && NA.bring.length ? h('p', { text: U('BRING_LEAD', '請帶：') + NA.bring.join('、') }) : null,
      D.next.note ? h('p', { text: D.next.note }) : null,
      NA && NA.note ? h('p', { text: NA.note }) : null)); }
    (D.self || []).forEach(function (t) { s.appendChild(h('p', { cls: 'edit-line', text: t })); });
    s.appendChild(h('p', { cls: 'foot', text: '依據：' + ((D.footer.sources || []).join('、') || '院內簽核內容') + (D.footer.self_written ? '｜含照護者補充說明' : '') }));
    var fb = h('section', { cls: 'panel' }, h('h2', { text: '幫我們做得更好（匿名）' }));
    var ans = {};
    var q = function (k, t) { return h('div', { cls: 'field' }, h('span', { cls: 'lab', text: t }), h('div', { cls: 'seg', role: 'group', 'aria-label': t }, ['是', '否'].map(function (v) { return h('button', { type: 'button', 'aria-pressed': 'false', text: v, on: { click: function (e) { ans[k] = v === '是'; Array.prototype.forEach.call(e.target.parentNode.children, function (b) { b.setAttribute('aria-pressed', String(b === e.target)); }); } } }); }))); };
    fb.appendChild(q('learned', '這次有沒有學到新東西？'));
    fb.appendChild(q('repeated', '有沒有覺得內容重複？'));
    fb.appendChild(h('button', { cls: 'btn', type: 'button', text: '送出', on: { click: function (e) { if (ans.learned === undefined || ans.repeated === undefined) return; e.target.disabled = true; post('publicFeedback', { token: token, learned: ans.learned, repeated: ans.repeated }).then(function (r2) { while (fb.firstChild) fb.removeChild(fb.firstChild); fb.appendChild(h('p', { text: r2.ok ? '謝謝您的回饋。' : r2.error.message })); }); } } }));
    s.appendChild(fb);
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(s);
  }, function () { msg('網路連線失敗，請稍後重新掃描。'); }).catch(function (e) { console.error(e); msg('顯示單張時發生錯誤，請向照護人員索取紙本單張。'); });
})();
