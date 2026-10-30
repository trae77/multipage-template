// Public site script: lead form (honeypot + Turnstile token -> /api/leads), click-to-load map, optional chat widget.
(function () {
  'use strict';
  var data = {}; try { data = JSON.parse(document.getElementById('site-data').textContent); } catch (e) {}
  // Map: nothing loads from Google until the visitor asks.
  document.querySelectorAll('[data-map-load]').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.parentNode, f = document.createElement('iframe');
      f.src = box.getAttribute('data-map-src'); f.title = box.getAttribute('data-map-title') || 'Map';
      f.loading = 'lazy'; f.referrerPolicy = 'no-referrer'; box.replaceChild(f, b);
    });
  });
  var form = document.getElementById('lead-form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var st = form.querySelector('.form-status'), fd = new FormData(form), body = { kind: 'routine' };
    ['name', 'email', 'phone', 'service', 'details', 'website'].forEach(function (k) { body[k] = String(fd.get(k) || ''); });
    body.turnstile = String(fd.get('cf-turnstile-response') || '');
    if (!form.checkValidity()) { st.textContent = 'Please fill in your name, email and details.'; return; }
    st.textContent = 'Sending...';
    fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) { form.reset(); st.textContent = 'Thanks! We got your request and will reach out soon.'; }
        else st.textContent = (x.j && x.j.error) || 'Something went wrong. Please call us.';
        if (window.turnstile) try { window.turnstile.reset(); } catch (e2) {}
      })
      .catch(function () { st.textContent = 'Network error. Please call us at ' + (data.phone || '') + '.'; });
  });
  // Optional chat widget (features.chat). Local answers only: no third-party script, no data sent anywhere.
  var root = document.getElementById('chat-root');
  if (root && document.body.getAttribute('data-chat') === 'on') {
    var open = false;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.textContent = 'Questions? Chat';
    btn.setAttribute('aria-expanded', 'false');
    var panel = document.createElement('div'); panel.className = 'chat-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Quick answers');
    var out = document.createElement('p'); out.setAttribute('aria-live', 'polite'); out.textContent = 'Hi! Pick a question:';
    var acts = document.createElement('div'); acts.className = 'acts';
    var A = [['Hours?', 'Our hours: ' + data.hours + '.'], ['Where do you work?', 'We serve ' + data.area + '.'],
      ['What do you do?', (data.services || []).join(', ') + '.'], ['Talk to a person', 'Call or text ' + data.phone + ', or use the estimate form.']];
    A.forEach(function (q) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = q[0];
      b.addEventListener('click', function () { out.textContent = q[1]; }); acts.appendChild(b); });
    panel.appendChild(out); panel.appendChild(acts);
    btn.addEventListener('click', function () { open = !open; panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
    root.appendChild(panel); root.appendChild(btn);
  }
})();
