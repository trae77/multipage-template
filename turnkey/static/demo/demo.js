// Interactive DEMO dashboards. SAMPLE data only. No network calls, no cookies: state lives in localStorage under tk-demo-v1:*.
(function () {
  'use strict';
  var root = document.getElementById('demo');
  var kind = root.getAttribute('data-demo') === 'client' ? 'client' : 'owner';
  var KEY = 'tk-demo-v1:' + kind;
  var SEED = {
    owner: {
      leads: [
        { id: 1, title: 'Sample Customer A', a: 'Deck repair', b: 'new' },
        { id: 2, title: 'Sample Customer B', a: 'Burst pipe (emergency)', b: 'contacted' }
      ],
      estimates: [
        { id: 1, title: 'Sample kitchen refresh', a: 'Sample Customer A', b: 'requested' },
        { id: 2, title: 'Sample fence replacement', a: 'Sample Customer C', b: 'approved' }
      ],
      projects: [
        { id: 1, title: 'Sample bathroom remodel', a: 'Sample Customer C', b: 'in progress' }
      ],
      payments: [
        { id: 1, title: 'INV-DEMO-1 $500.00', a: 'Sample Customer C', b: 'pending' }
      ]
    },
    client: {
      jobs: [
        { id: 1, title: 'Sample bathroom remodel', a: 'Tile set, fixtures next', b: 'in progress' }
      ],
      estimates: [
        { id: 1, title: 'Sample deck stain', a: 'Back deck, about 300 sq ft', b: 'requested' }
      ],
      messages: [
        { id: 1, title: 'Sample note from the shop', a: 'Crew arrives 8 AM Tuesday', b: 'unread' }
      ]
    }
  };
  var SCHEMA = {
    owner: [
      ['leads', 'Leads', 'Name', 'Service', ['new', 'contacted', 'closed']],
      ['estimates', 'Estimate requests', 'Job', 'Customer', ['requested', 'approved', 'declined']],
      ['projects', 'Projects', 'Project', 'Customer', ['planned', 'in progress', 'done']],
      ['payments', 'Payments', 'Invoice', 'Customer', ['pending', 'paid', 'rejected']]
    ],
    client: [
      ['jobs', 'My jobs', 'Job', 'Update', ['planned', 'in progress', 'done']],
      ['estimates', 'My estimate requests', 'Job', 'Details', ['requested', 'approved', 'declined']],
      ['messages', 'Messages', 'Subject', 'Message', ['unread', 'read']]
    ]
  };
  var clip = function (v) { return String(v == null ? '' : v).slice(0, 120); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function load() {
    var seed = clone(SEED[kind]);
    try {
      var s = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (!s || typeof s !== 'object' || Array.isArray(s)) return seed;
      // Each collection must be an array of plain items; anything else falls back to that collection's seed.
      SCHEMA[kind].forEach(function (sc) {
        var v = s[sc[0]];
        seed[sc[0]] = Array.isArray(v) ? v.filter(function (it) { return it && typeof it === 'object' && typeof it.id === 'number'; }).map(function (it) {
          return { id: it.id, title: clip(it.title), a: clip(it.a), b: sc[4].indexOf(it.b) >= 0 ? it.b : sc[4][0] };
        }) : seed[sc[0]];
      });
    } catch (e) {}
    return seed;
  }
  var editing = null;
  var state = load();
  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') n.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function render() {
    root.textContent = '';
    var sum = el('div', { class: 'summary' }, SCHEMA[kind].map(function (s) {
      return el('div', {}, [el('b', { text: String((state[s[0]] || []).length) }), el('span', { text: s[1] })]);
    }));
    root.appendChild(sum);
    SCHEMA[kind].forEach(function (s) {
      var key = s[0], list = state[key] = state[key] || [];
      var rows = el('div', { class: 'rows' }, list.length ? list.map(function (it) {
        var sel = el('select', { 'aria-label': 'Status for ' + it.title, onchange: function (e) { it.b = e.target.value; save(); render(); } },
          s[4].map(function (o) { var op = el('option', { value: o, text: o }); if (o === it.b) op.selected = true; return op; }));
        var ef = null;
        if (editing === it) {
          var e1 = el('input', { 'aria-label': s[2], maxlength: '120', required: '' }); e1.value = it.title;
          var e2 = el('input', { 'aria-label': s[3], maxlength: '120' }); e2.value = it.a;
          ef = el('form', { class: 'add edit', onsubmit: function (ev) { ev.preventDefault(); it.title = clip(e1.value) || it.title; it.a = clip(e2.value); editing = null; save(); render(); } },
            [el('label', { text: s[2] }, [e1]), el('label', { text: s[3] }, [e2]), el('div', { class: 'acts' }, [el('button', { type: 'submit', text: 'Save' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', onclick: function () { editing = null; render(); } })])]);
        }
        return el('div', { class: 'row' }, [
          el('div', { class: 't', text: it.title }), el('div', { class: 'm', text: s[3] + ': ' + it.a }), ef,
          el('div', { class: 'acts' }, [sel,
            el('button', { type: 'button', class: 'ghost', text: 'Edit', 'aria-expanded': editing === it ? 'true' : 'false', onclick: function () { editing = editing === it ? null : it; render(); } }),
            el('button', { type: 'button', class: 'danger', text: 'Delete', onclick: function () {
              state[key] = list.filter(function (x) { return x !== it; }); if (editing === it) editing = null; save(); render(); } })])
        ]);
      }) : [el('p', { class: 'empty', text: 'No sample items. Add one below.' })]);
      var f1 = el('input', { 'aria-label': s[2], placeholder: s[2] + ' (sample)', maxlength: '120', required: '' });
      var f2 = el('input', { 'aria-label': s[3], placeholder: s[3], maxlength: '120' });
      var form = el('form', { class: 'add', onsubmit: function (e) {
        e.preventDefault(); var id = list.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
        list.push({ id: id, title: clip(f1.value), a: clip(f2.value), b: s[4][0] }); save(); render(); } },
        [f1, f2, el('button', { type: 'submit', text: 'Add' })]);
      root.appendChild(el('section', { class: 'card' }, [el('h3', { text: s[1] }), rows, form]));
    });
  }
  document.getElementById('demo-reset').addEventListener('click', function () {
    try { window.localStorage.removeItem(KEY); } catch (e) {} state = clone(SEED[kind]); editing = null; render();
  });
  render();
})();
