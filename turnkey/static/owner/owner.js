// Real owner dashboard: reads /api/owner/leads (behind Cloudflare Access + OWNER_EMAILS check in the Worker).
(function () {
  'use strict';
  var list = document.getElementById('leads'), st = document.getElementById('status');
  function row(l) {
    var d = document.createElement('div'); d.className = 'row';
    var t = document.createElement('div'); t.className = 't'; t.textContent = l.name + (l.service ? ' - ' + l.service : '');
    var m = document.createElement('div'); m.className = 'm'; m.textContent = [l.email, l.phone, l.created_at].filter(Boolean).join(' · ');
    var x = document.createElement('div'); x.textContent = l.details;
    d.appendChild(t); d.appendChild(m); d.appendChild(x); return d;
  }
  function load() {
    st.textContent = 'Loading...';
    fetch('/api/owner/leads', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) { list.textContent = ''; (j.leads || []).forEach(function (l) { list.appendChild(row(l)); });
        st.textContent = (j.leads || []).length ? (j.leads.length + ' lead(s)') : 'No leads yet.'; })
      .catch(function (e) { st.textContent = 'Could not load leads (' + e.message + '). Sign in again if needed.'; });
  }
  document.getElementById('reload').addEventListener('click', load); load();
})();
