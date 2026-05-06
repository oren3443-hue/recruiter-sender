// State
const state = {
  password: '',
  baseUrl: '',
  secret: '',
  leads: [],         // [{ id, full_name, phone_number, adset_name, city, source_tab, source_tab_gid, row_index, created_time }]
  uniqueJobs: [],    // [adset_name, ...]
  jobMapping: {},    // { adset_name: 'מסומן בטופס' }
  selected: new Set(),
  activeTab: 'sheet',
  filters: {
    search: '',
    roles: [],
    dateRange: 'all'
  },
  lastResult: null
};

// View switching
const views = {
  login: document.getElementById('view-login'),
  app:   document.getElementById('view-app')
};
function show(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  window.scrollTo(0, 0);
}

// Tabs
const tabs = ['sheet', 'manual', 'result'];
function setTab(name) {
  state.activeTab = name;
  tabs.forEach(t => {
    const tabBtn = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    const isActive = t === name;
    tabBtn.classList.toggle('active', isActive);
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
  if (name === 'manual') ensureManualInitialized();
}
tabs.forEach(t => {
  document.getElementById(`tab-${t}`).addEventListener('click', () => setTab(t));
});

// Loader
const loader = document.getElementById('loader');
const loaderMsg = document.getElementById('loader-msg');
function setLoading(on, msg = 'טוען…') {
  loaderMsg.textContent = msg;
  loader.hidden = !on;
}

// Error helpers
function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.hidden = false;
}
function clearError(elId) {
  document.getElementById(elId).hidden = true;
}

// Parse password to (subdomain, secret)
function parsePassword(pw) {
  const idx = pw.indexOf('=');
  if (idx <= 0 || idx === pw.length - 1) {
    throw new Error('פורמט הסיסמה: <סביבה>=<סוד>');
  }
  const subdomain = pw.slice(0, idx).trim();
  const secret = pw.slice(idx + 1).trim();
  if (!/^[a-z0-9-]+$/i.test(subdomain)) {
    throw new Error('שם הסביבה חייב להיות אותיות/ספרות/מקפים בלבד');
  }
  return { subdomain, secret };
}

function buildBase(subdomain) {
  return `https://${subdomain}.app.n8n.cloud/webhook/glassix-recruit`;
}

async function postJSON(url, secret, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': secret
    },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `שגיאה (${res.status})`;
    if (res.status === 401) msg = 'סיסמה שגויה';
    else if (text) {
      try {
        const j = JSON.parse(text);
        if (j && j.message) msg = j.message;
      } catch {}
    }
    throw new Error(msg);
  }
  // Defensive parse — n8n sometimes returns empty body on success
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return {}; }
}

// Login flow — single button, loads leads then opens app on Sheet tab
document.getElementById('btn-enter').addEventListener('click', async () => {
  clearError('login-error');
  const pw = document.getElementById('password').value;
  let parsed;
  try {
    parsed = parsePassword(pw);
  } catch (e) {
    showError('login-error', e.message);
    return;
  }
  state.password = pw;
  state.secret = parsed.secret;
  state.baseUrl = buildBase(parsed.subdomain);

  try {
    await loadLeads();
    show('app');
    setTab('sheet');
  } catch (e) {
    showError('login-error', e.message);
  }
});

document.getElementById('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-enter').click();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  show('login');
  document.getElementById('password').value = '';
  document.getElementById('sender-name').value = '';
  document.getElementById('manual-sender-name').value = '';
  state.leads = [];
  state.uniqueJobs = [];
  state.jobMapping = {};
  state.selected = new Set();
  state.lastResult = null;
  state.filters = { search: '', role: '', dateRange: 'all' };
  document.getElementById('tab-result').hidden = true;
});

// Load leads (used both on initial entry and refresh)
async function loadLeads() {
  setLoading(true, 'טוען לידים…');
  try {
    const data = await postJSON(`${state.baseUrl}/get-leads`, state.secret, {});
    state.leads = data.leads || [];
    state.uniqueJobs = data.unique_jobs || [];
    // Drop selections for leads that no longer exist
    const validIds = new Set(state.leads.map(l => l.id));
    state.selected = new Set([...state.selected].filter(id => validIds.has(id)));
    renderPickView();
  } finally {
    setLoading(false);
  }
}

document.getElementById('btn-refresh').addEventListener('click', async () => {
  clearError('send-error');
  try {
    await loadLeads();
  } catch (e) {
    showError('send-error', e.message);
  }
});

// ============================================================
// Time formatting — relative Hebrew labels
// ============================================================

function formatLeadTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  // Less than 60 minutes → "לפני N דק׳"
  if (diffMin < 1) return 'הרגע';
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;

  // Same calendar day → "היום HH:MM"
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `היום ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  // Yesterday → "אתמול HH:MM"
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `אתמול ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // < 7 days → "לפני N ימים"
  const diffDays = Math.floor((now.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000);
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  // Else: DD/MM/YYYY
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }

// Format Israeli phone for display: 0XX-XXXXXXX
function formatPhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/^p:/, '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  // 10-digit Israeli mobile/landline → 3-7 split
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  // 9-digit landline (e.g. 02-1234567) → 2-7 split
  if (digits.length === 9 && digits.startsWith('0')) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  // Fallback: return cleaned digits as-is
  return digits || String(raw).replace(/^p:/, '');
}

// ============================================================
// Filtering
// ============================================================

function getFilteredLeads() {
  const { search, dateRange } = state.filters;
  const q = search.trim().toLowerCase();

  let cutoff = null;
  if (dateRange === 'today') {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    cutoff = t.getTime();
  } else if (dateRange === '7' || dateRange === '30') {
    cutoff = Date.now() - parseInt(dateRange, 10) * 86400000;
  }

  return state.leads.filter(l => {
    if (state.filters.roles.length > 0 && !state.filters.roles.includes(l.adset_name)) return false;
    if (q) {
      const hay = [
        l.full_name || '',
        formatPhone(l.phone_number),
        (l.phone_number || '').replace(/^p:/, ''),
        l.city || '',
        l.adset_name || ''
      ].join(' ').toLowerCase();
      // For digit-only queries, also strip non-digits from haystack to match raw numbers
      const qDigits = q.replace(/\D/g, '');
      if (qDigits && qDigits === q.trim()) {
        const hayDigits = hay.replace(/\D/g, '');
        if (hayDigits.includes(qDigits)) return true;
      }
      if (!hay.includes(q)) return false;
    }
    if (cutoff !== null && l.created_time) {
      const t = new Date(l.created_time).getTime();
      if (!isNaN(t) && t < cutoff) return false;
    }
    return true;
  });
}

// Filter input listeners
document.getElementById('filter-search').addEventListener('input', e => {
  state.filters.search = e.target.value;
  renderPickView();
});
document.querySelectorAll('.date-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filters.dateRange = btn.dataset.range;
    document.querySelectorAll('.date-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderPickView();
  });
});

document.getElementById('roles-all').addEventListener('click', () => {
  state.filters.roles = [...state.uniqueJobs];
  renderPickView();
});
document.getElementById('roles-none').addEventListener('click', () => {
  state.filters.roles = [];
  renderPickView();
});

// Close role filter dropdown when clicking outside
document.addEventListener('click', e => {
  const wrap = document.getElementById('filter-role-wrap');
  if (wrap && wrap.open && !wrap.contains(e.target)) wrap.open = false;
});

// ============================================================
// Render — sheet pick view
// ============================================================

function renderPickView() {
  document.getElementById('leads-count').textContent = `${state.leads.length}`;

  // Job mapping rows
  const mapBox = document.getElementById('job-mapping');
  mapBox.innerHTML = '';
  if (state.uniqueJobs.length === 0) {
    mapBox.innerHTML = '<p class="muted">אין משרות למפות (אין לידים פנויים).</p>';
  }
  state.uniqueJobs.forEach(job => {
    const raw = document.createElement('div');
    raw.className = 'raw';
    raw.textContent = job || '(ריק)';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = `${job || '(ריק)'} — ברירת מחדל`;
    inp.value = state.jobMapping[job] || '';
    inp.addEventListener('input', e => {
      state.jobMapping[job] = e.target.value.trim();
      updateSendButton();
    });
    mapBox.appendChild(raw);
    mapBox.appendChild(inp);
  });

  // Role filter — multi-select dropdown with checkboxes
  const roleList = document.getElementById('filter-role-list');
  const validRoles = state.filters.roles.filter(r => state.uniqueJobs.includes(r));
  state.filters.roles = validRoles;
  roleList.innerHTML = '';
  state.uniqueJobs.forEach(job => {
    const label = document.createElement('label');
    label.className = 'role-opt';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = job;
    cb.checked = validRoles.includes(job);
    cb.addEventListener('change', e => {
      if (e.target.checked) {
        if (!state.filters.roles.includes(job)) state.filters.roles.push(job);
      } else {
        state.filters.roles = state.filters.roles.filter(r => r !== job);
      }
      renderPickView();
    });
    const span = document.createElement('span');
    span.textContent = job || '(ריק)';
    label.append(cb, span);
    roleList.appendChild(label);
  });
  const summary = document.getElementById('filter-role-summary');
  const n = state.filters.roles.length;
  if (n === 0) summary.textContent = 'כל התפקידים';
  else if (n === 1) summary.textContent = state.filters.roles[0];
  else if (n === state.uniqueJobs.length) summary.textContent = `כל התפקידים (${n})`;
  else summary.textContent = `${n} תפקידים נבחרו`;

  // Filtered leads table
  const filtered = getFilteredLeads();
  const body = document.getElementById('leads-body');
  body.innerHTML = '';
  filtered.forEach(lead => {
    const tr = document.createElement('tr');
    tr.dataset.id = lead.id;

    const tdC = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(lead.id);
    cb.addEventListener('change', () => toggleLead(lead.id, cb.checked, tr));
    tdC.appendChild(cb);

    const tdName = document.createElement('td');
    tdName.textContent = lead.full_name || '';
    const tdPhone = document.createElement('td');
    tdPhone.textContent = formatPhone(lead.phone_number);
    tdPhone.className = 'col-phone';
    tdPhone.title = (lead.phone_number || '').replace(/^p:/, '');
    const tdJob = document.createElement('td');
    tdJob.textContent = lead.adset_name || '';
    const tdTime = document.createElement('td');
    tdTime.className = 'col-time';
    tdTime.textContent = formatLeadTime(lead.created_time);
    if (lead.created_time) tdTime.title = lead.created_time;
    const tdCity = document.createElement('td');
    tdCity.textContent = lead.city || '';

    tr.append(tdC, tdName, tdPhone, tdJob, tdTime, tdCity);
    if (cb.checked) tr.classList.add('checked');
    body.appendChild(tr);
  });

  document.getElementById('filter-summary').textContent =
    `מציג ${filtered.length} מתוך ${state.leads.length}`;

  updateSelectedCount();
  updateSendButton();
}

function toggleLead(id, on, tr) {
  if (on) state.selected.add(id);
  else state.selected.delete(id);
  tr.classList.toggle('checked', on);
  updateSelectedCount();
  updateSendButton();
}

function updateSelectedCount() {
  document.getElementById('selected-count').textContent =
    `נבחרו ${state.selected.size} מתוך ${state.leads.length}`;
}

function updateSendButton() {
  const btn = document.getElementById('btn-send');
  const hint = document.getElementById('send-hint');
  const sender = document.getElementById('sender-name').value.trim();

  if (state.selected.size === 0) {
    btn.disabled = true;
    hint.textContent = 'בחרי לפחות ליד אחד';
    return;
  }
  if (!sender) {
    btn.disabled = true;
    hint.textContent = 'מלאי את שמך';
    return;
  }
  btn.disabled = false;
  hint.textContent = `מוכן לשליחה ל־${state.selected.size} לידים.`;
}

document.getElementById('sender-name').addEventListener('input', updateSendButton);

document.getElementById('btn-select-all').addEventListener('click', () => {
  // Select only what's currently visible (filtered)
  getFilteredLeads().forEach(l => state.selected.add(l.id));
  renderPickView();
});
document.getElementById('btn-clear').addEventListener('click', () => {
  state.selected = new Set();
  renderPickView();
});

document.getElementById('btn-send').addEventListener('click', sendMessages);

async function sendMessages() {
  clearError('send-error');
  const sender = document.getElementById('sender-name').value.trim();
  const selectedLeads = state.leads.filter(l => state.selected.has(l.id));

  // Build effective mapping: blank → fallback to raw adset_name
  const effectiveMapping = {};
  state.uniqueJobs.forEach(j => {
    effectiveMapping[j] = (state.jobMapping[j] || '').trim() || j;
  });

  setLoading(true, `שולח ל־${selectedLeads.length} לידים… (זה לוקח ~${Math.ceil(selectedLeads.length * 2 / 60)} דק׳)`);
  try {
    const data = await postJSON(`${state.baseUrl}/send-messages`, state.secret, {
      sender_name: sender,
      job_mapping: effectiveMapping,
      selected_leads: selectedLeads
    });
    state.lastResult = data;
    renderResultView(data);
    document.getElementById('tab-result').hidden = false;
    setTab('result');
  } catch (e) {
    showError('send-error', e.message);
  } finally {
    setLoading(false);
  }
}

// ============================================================
// Result rendering
// ============================================================

function renderResultView(data) {
  const summary = data.summary || { sent: 0, failed: 0, skipped: 0 };
  let summaryText = `נשלחו ${summary.sent} • נכשלו ${summary.failed}`;
  if (summary.skipped) summaryText += ` • דולגו ${summary.skipped}`;
  document.getElementById('result-summary').textContent = summaryText;
  const body = document.getElementById('result-body');
  body.innerHTML = '';
  (data.results || []).forEach(r => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = r.full_name || r.name || r.id || '';
    const tdStatus = document.createElement('td');
    if (r.status === 'sent') {
      tdStatus.innerHTML = '<span class="status-ok">✓ נשלח</span>';
    } else if (r.status === 'skipped') {
      tdStatus.innerHTML = '<span class="status-skip">⊘ דולג</span>';
    } else {
      tdStatus.innerHTML = '<span class="status-fail">✗ נכשל</span>';
    }
    const tdReason = document.createElement('td');
    tdReason.textContent = r.reason || '';
    tr.append(tdName, tdStatus, tdReason);
    body.appendChild(tr);
  });
}

// ============================================================
// Manual send mode
// ============================================================

const manualState = {
  rows: []
};

let nextRowId = 1;
function makeRow() {
  return { id: nextRowId++, full_name: '', phone: '', job: '' };
}

function ensureManualInitialized() {
  if (manualState.rows.length === 0) {
    manualState.rows = [makeRow()];
    renderManualRows();
  }
}

document.getElementById('btn-add-row').addEventListener('click', () => {
  manualState.rows.push(makeRow());
  renderManualRows();
});

document.getElementById('manual-sender-name').addEventListener('input', updateManualSendButton);

function renderManualRows() {
  const box = document.getElementById('manual-rows');
  box.innerHTML = '';
  manualState.rows.forEach(row => {
    const wrap = document.createElement('div');
    wrap.className = 'manual-row';
    wrap.dataset.rowId = row.id;

    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.placeholder = 'שם';
    nameInp.value = row.full_name;
    nameInp.addEventListener('input', e => { row.full_name = e.target.value; updateManualSendButton(); });

    const phoneInp = document.createElement('input');
    phoneInp.type = 'tel';
    phoneInp.placeholder = 'טלפון';
    phoneInp.dir = 'ltr';
    phoneInp.value = row.phone;
    phoneInp.addEventListener('input', e => { row.phone = e.target.value; updateManualSendButton(); });

    const jobInp = document.createElement('input');
    jobInp.type = 'text';
    jobInp.placeholder = 'משרה';
    jobInp.value = row.job;
    jobInp.addEventListener('input', e => { row.job = e.target.value; updateManualSendButton(); });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'row-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'הסר נמען';
    removeBtn.addEventListener('click', () => {
      manualState.rows = manualState.rows.filter(r => r.id !== row.id);
      if (manualState.rows.length === 0) manualState.rows = [makeRow()];
      renderManualRows();
    });

    wrap.append(nameInp, phoneInp, jobInp, removeBtn);
    box.appendChild(wrap);
  });
  document.getElementById('manual-count').textContent = manualState.rows.length;
  updateManualSendButton();
}

function isValidPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  return (digits.length === 10 && digits.startsWith('0')) ||
         (digits.length === 12 && digits.startsWith('972'));
}

function updateManualSendButton() {
  const btn = document.getElementById('btn-manual-send');
  const hint = document.getElementById('manual-hint');
  const sender = document.getElementById('manual-sender-name').value.trim();

  if (!sender) {
    btn.disabled = true;
    hint.textContent = 'מלאי את שמך';
    return;
  }
  const filled = manualState.rows.filter(r => r.full_name.trim() || r.phone.trim() || r.job.trim());
  if (filled.length === 0) {
    btn.disabled = true;
    hint.textContent = 'הוסיפי לפחות נמען אחד';
    return;
  }
  for (const row of filled) {
    if (!row.full_name.trim() || !row.phone.trim() || !row.job.trim()) {
      btn.disabled = true;
      hint.textContent = 'יש למלא בכל שורה: שם, טלפון ומשרה';
      return;
    }
    if (!isValidPhone(row.phone)) {
      btn.disabled = true;
      hint.textContent = `טלפון לא תקין: ${row.phone}`;
      return;
    }
  }
  btn.disabled = false;
  hint.textContent = `מוכן לשליחה ל־${filled.length} נמענים.`;
}

document.getElementById('btn-manual-send').addEventListener('click', sendManual);

async function sendManual() {
  clearError('manual-error');
  const sender = document.getElementById('manual-sender-name').value.trim();
  const recipients = manualState.rows
    .filter(r => r.full_name.trim() && r.phone.trim() && r.job.trim())
    .map(r => ({ full_name: r.full_name.trim(), phone_number: r.phone.trim(), job: r.job.trim() }));

  setLoading(true, `שולח ל־${recipients.length} נמענים… (~${Math.ceil(recipients.length * 2 / 60)} דק׳)`);
  try {
    const data = await postJSON(`${state.baseUrl}/send-manual`, state.secret, {
      sender_name: sender,
      recipients
    });
    state.lastResult = data;
    renderResultView(data);
    document.getElementById('tab-result').hidden = false;
    setTab('result');
  } catch (e) {
    showError('manual-error', e.message);
  } finally {
    setLoading(false);
  }
}
