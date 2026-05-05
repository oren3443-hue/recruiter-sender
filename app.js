// State
const state = {
  password: '',
  baseUrl: '',
  secret: '',
  leads: [],         // [{ id, full_name, phone_number, adset_name, city, source_tab, row_index }]
  uniqueJobs: [],    // [adset_name, ...]
  jobMapping: {},    // { adset_name: 'מסומן בטופס' }
  selected: new Set()
};

// View switching
const views = {
  login:  document.getElementById('view-login'),
  pick:   document.getElementById('view-pick'),
  manual: document.getElementById('view-manual'),
  result: document.getElementById('view-result')
};
function show(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  window.scrollTo(0, 0);
}

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
  if (!res.ok) {
    let msg = `שגיאה (${res.status})`;
    if (res.status === 401) msg = 'סיסמה שגויה';
    else {
      try {
        const j = await res.json();
        if (j && j.message) msg = j.message;
      } catch {}
    }
    throw new Error(msg);
  }
  return res.json();
}

// View 1: load leads
document.getElementById('btn-load').addEventListener('click', async () => {
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

  setLoading(true, 'טוען לידים…');
  try {
    const data = await postJSON(`${state.baseUrl}/get-leads`, state.secret, {});
    state.leads = data.leads || [];
    state.uniqueJobs = data.unique_jobs || [];
    state.jobMapping = {};
    state.selected = new Set();
    renderPickView();
    show('pick');
  } catch (e) {
    showError('login-error', e.message);
  } finally {
    setLoading(false);
  }
});

// View 2: render mapping + leads
function renderPickView() {
  const countEl = document.getElementById('leads-count');
  countEl.textContent = `${state.leads.length}`;

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
    inp.placeholder = 'שם המשרה כפי שיופיע בהודעה';
    inp.value = state.jobMapping[job] || '';
    inp.addEventListener('input', e => {
      state.jobMapping[job] = e.target.value.trim();
      updateSendButton();
    });
    mapBox.appendChild(raw);
    mapBox.appendChild(inp);
  });

  // Leads table
  const body = document.getElementById('leads-body');
  body.innerHTML = '';
  state.leads.forEach(lead => {
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
    tdPhone.textContent = (lead.phone_number || '').replace(/^p:/, '');
    tdPhone.style.direction = 'ltr';
    const tdJob = document.createElement('td');
    tdJob.textContent = lead.adset_name || '';
    const tdCity = document.createElement('td');
    tdCity.textContent = lead.city || '';

    tr.append(tdC, tdName, tdPhone, tdJob, tdCity);
    if (cb.checked) tr.classList.add('checked');
    body.appendChild(tr);
  });
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
  // All selected leads' jobs must be mapped
  const usedJobs = new Set();
  state.leads.forEach(l => { if (state.selected.has(l.id)) usedJobs.add(l.adset_name); });
  const missing = [...usedJobs].filter(j => !(state.jobMapping[j] || '').trim());
  if (missing.length) {
    btn.disabled = true;
    hint.textContent = `יש למפות את המשרות: ${missing.join(', ')}`;
    return;
  }
  btn.disabled = false;
  hint.textContent = `מוכן לשליחה ל־${state.selected.size} לידים.`;
}

document.getElementById('sender-name').addEventListener('input', updateSendButton);

document.getElementById('btn-select-all').addEventListener('click', () => {
  state.leads.forEach(l => state.selected.add(l.id));
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

  setLoading(true, `שולח ל־${selectedLeads.length} לידים… (זה לוקח ~${Math.ceil(selectedLeads.length * 2 / 60)} דק׳)`);
  try {
    const data = await postJSON(`${state.baseUrl}/send-messages`, state.secret, {
      sender_name: sender,
      job_mapping: state.jobMapping,
      selected_leads: selectedLeads
    });
    renderResultView(data);
    show('result');
  } catch (e) {
    showError('send-error', e.message);
  } finally {
    setLoading(false);
  }
}

// View 3: result
function renderResultView(data) {
  const summary = data.summary || { sent: 0, failed: 0 };
  document.getElementById('result-summary').textContent =
    `נשלחו ${summary.sent} • נכשלו ${summary.failed}`;
  const body = document.getElementById('result-body');
  body.innerHTML = '';
  (data.results || []).forEach(r => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = r.full_name || r.name || r.id || '';
    const tdStatus = document.createElement('td');
    if (r.status === 'sent') {
      tdStatus.innerHTML = '<span class="status-ok">✓ נשלח</span>';
    } else {
      tdStatus.innerHTML = '<span class="status-fail">✗ נכשל</span>';
    }
    const tdReason = document.createElement('td');
    tdReason.textContent = r.reason || '';
    tr.append(tdName, tdStatus, tdReason);
    body.appendChild(tr);
  });
}

document.getElementById('btn-back').addEventListener('click', () => {
  show('login');
  document.getElementById('password').value = '';
  document.getElementById('sender-name').value = '';
});

// Submit on Enter in password field
document.getElementById('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-load').click();
});

// ============================================================
// Manual send mode
// ============================================================

const manualState = {
  rows: []  // [{ id, full_name, phone, job }]
};

let nextRowId = 1;
function makeRow() {
  return { id: nextRowId++, full_name: '', phone: '', job: '' };
}

document.getElementById('btn-manual').addEventListener('click', () => {
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

  if (manualState.rows.length === 0) manualState.rows = [makeRow()];
  renderManualRows();
  show('manual');
});

document.getElementById('btn-manual-back').addEventListener('click', () => {
  show('login');
});

document.getElementById('btn-add-row').addEventListener('click', () => {
  manualState.rows.push(makeRow());
  renderManualRows();
});

document.getElementById('manual-sender-name').addEventListener('input', updateManualSendButton);

function renderManualRows() {
  const box = document.getElementById('manual-rows');
  box.innerHTML = '';
  manualState.rows.forEach((row, idx) => {
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
  // Local Israeli (10 digits, leading 0) or international (12 digits, 972)
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
    renderResultView(data);
    show('result');
  } catch (e) {
    showError('manual-error', e.message);
  } finally {
    setLoading(false);
  }
}
