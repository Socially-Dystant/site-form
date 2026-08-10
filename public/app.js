// -----------------------------
// Context
// -----------------------------
const form = document.getElementById('siteForm');
const params = new URLSearchParams(window.location.search);

const siteId = params.get('siteId');
const accountId = params.get('accountId');

// Service_Item__c and Current_Equipment__c ids, passed in by the launching LWC
// (these use the same names as the Flow's own variables: recordId / varEquipmentId).
const recordId = params.get('recordId');
const varEquipmentId = params.get('varEquipmentId');

// Draft key is scoped per Site + Account (important)
const DRAFT_KEY = `siteFormDraft_${siteId || 'none'}_${accountId || 'none'}`;

// Fail fast if context is missing
if (!siteId || !accountId) {
  alert('Missing Site or Account context. Please launch this form from Salesforce.');
}

if (!recordId) {
  // Not fatal (a Site-only save can still go through), but Service Item / Current
  // Equipment fields won't be saved without it.
  console.warn('No recordId (Service_Item__c Id) present in the URL — Service Item and Current Equipment fields will not be saved.');
}

// -----------------------------
// Generic form (de)serialization
// Handles plain inputs, single boolean checkboxes, radio groups,
// and multi-checkbox groups that share a name attribute.
// -----------------------------
function serializeForm(formEl) {
  const result = {};
  const seen = new Set();
  Array.from(formEl.elements).forEach((el) => {
    if (!el.name || seen.has(el.name)) return;
    seen.add(el.name);

    const group = formEl.querySelectorAll(`[name="${el.name}"]`);

    if (el.type === 'checkbox' && group.length > 1) {
      // Multi-select checkbox group -> array of checked values
      result[el.name] = Array.from(group)
        .filter((x) => x.checked)
        .map((x) => x.value);
    } else if (el.type === 'checkbox') {
      // Single boolean checkbox
      result[el.name] = el.checked;
    } else if (el.type === 'radio') {
      const checked = Array.from(group).find((x) => x.checked);
      result[el.name] = checked ? checked.value : '';
    } else {
      result[el.name] = el.value;
    }
  });
  return result;
}

function restoreFormData(formEl, data) {
  if (!data) return;
  Object.entries(data).forEach(([key, value]) => {
    const group = formEl.querySelectorAll(`[name="${key}"]`);
    if (!group.length) return;

    if (group.length === 1 && group[0].type !== 'checkbox' && group[0].type !== 'radio') {
      group[0].value = value;
      return;
    }

    const values = Array.isArray(value) ? value : [value];
    group.forEach((el) => {
      if (el.type === 'checkbox') {
        if (group.length === 1) {
          el.checked = value === true || value === 'true';
        } else {
          el.checked = values.includes(el.value);
        }
      } else if (el.type === 'radio') {
        el.checked = values.includes(el.value);
      } else {
        el.value = value;
      }
    });
  });
}

// -----------------------------
// Conditional sections (Secondary/Tertiary Heating, Cooling)
// -----------------------------
function updateConditionals() {
  if (!form) return;
  document.querySelectorAll('.conditional').forEach((div) => {
    const dep = div.dataset.dependsOn;
    const control = form[dep];
    const shown = !!(control && control.checked);
    div.style.display = shown ? '' : 'none';
  });
}

function wireConditionals() {
  if (!form) return;
  const depNames = new Set(
    Array.from(document.querySelectorAll('.conditional')).map((d) => d.dataset.dependsOn)
  );
  depNames.forEach((name) => {
    const el = form[name];
    if (el) el.addEventListener('change', updateConditionals);
  });
  updateConditionals();
}

// -----------------------------
// Pagination (one page per flow section)
// -----------------------------
const pageEls = Array.from(document.querySelectorAll('.page'));
const totalPages = pageEls.length;
let currentPage = 0;

function showPage(idx) {
  currentPage = Math.max(0, Math.min(idx, totalPages - 1));
  pageEls.forEach((p) => {
    p.style.display = Number(p.dataset.page) === currentPage ? 'block' : 'none';
  });

  const backBtn = document.getElementById('btnBack');
  const nextBtn = document.getElementById('btnNext');
  if (backBtn) backBtn.disabled = currentPage === 0;
  if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;

  const indicator = document.getElementById('pageIndicator');
  if (indicator && window.PAGE_TITLES) {
    indicator.textContent = `Page ${currentPage + 1} of ${totalPages}: ${window.PAGE_TITLES[currentPage]}`;
  }

  window.scrollTo(0, 0);
}

// -----------------------------
// Restore from localStorage
// -----------------------------
if (form) {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    try {
      restoreFormData(form, JSON.parse(saved));
    } catch (e) {
      console.warn('Failed to restore local draft', e);
    }
  }
}

// -----------------------------
// Resume via token (resume.html#token)
// -----------------------------
const token = location.hash.replace('#', '');
if (token) {
  fetch(`/api/load/${token}`)
    .then((r) => r.json())
    .then((data) => {
      if (!data) return;
      restoreFormData(form, data);
      updateConditionals();
    })
    .catch((err) => console.error('Resume load failed', err));
}

// -----------------------------
// Save draft (offline-safe)
// -----------------------------
function saveDraftSilently() {
  if (!form) return null;

  const data = serializeForm(form);
  const draftToken = crypto.randomUUID();

  const payload = {
    siteId,
    accountId,
    data,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(`resume_${draftToken}`, JSON.stringify(payload));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));

  return draftToken;
}

function showResumeLink(draftToken) {
  const link =
    `${location.origin}/resume.html` +
    `?siteId=${encodeURIComponent(siteId)}` +
    `&accountId=${encodeURIComponent(accountId)}` +
    `#${draftToken}`;

  const box = document.getElementById('resumeBox');
  const input = document.getElementById('resumeLink');
  const row = document.getElementById('resumeLinkRow');
  const title = document.getElementById('resumeBoxTitle');
  const message = document.getElementById('resumeBoxMessage');

  if (title) title.innerHTML = '<strong>Saved</strong>';
  if (message) message.textContent = 'Resume link (copy & save):';
  if (row) row.style.display = 'flex';

  input.value = link;
  box.style.display = 'block';

  input.focus();
  input.select();
  input.setSelectionRange(0, 99999);
}

window.saveDraft = function () {
  const draftToken = saveDraftSilently();
  if (draftToken) showResumeLink(draftToken);
};

// -----------------------------
// Copy resume link (safe fallback)
// -----------------------------
window.copyResumeLink = function () {
  const input = document.getElementById('resumeLink');
  if (!input) return;

  input.focus();
  input.select();
  input.setSelectionRange(0, 99999);

  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(input.value);
    } else {
      document.execCommand('copy');
    }

    const msg = document.getElementById('copyStatus');
    if (msg) {
      msg.style.display = 'block';
      setTimeout(() => (msg.style.display = 'none'), 2000);
    }
  } catch (e) {
    alert('Please manually copy the link.');
  }
};

// -----------------------------
// Submit directly to Salesforce (used by Exit / Save & Finish)
//
// This calls the NrenAssessmentApi Apex REST resource, which saves straight into
// Site__c / Service_Item__c / Current_Equipment__c using the Flow's own field API
// names (see RCEA_Partial_Sandbox/force-app/main/default/classes/NrenAssessmentApi.cls).
// It replaces the previous Power Automate hop.
// -----------------------------

const SALESFORCE_REST_BASE_URL = 'https://renergy.my.salesforce.com';
const SALESFORCE_REST_PATH = '/services/apexrest/NrenAssessmentApi/v1/save';

async function submitAssessment() {
  const rawFields = serializeForm(form);
  const fields = {};
  Object.entries(rawFields).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Salesforce multi-select picklists expect a single ";"-delimited string,
      // not a JSON array.
      if (value.length) fields[key] = value.join(';');
    } else if (value !== '' && value !== false) {
      fields[key] = typeof value === 'string' && !isNaN(value) && value.trim() !== ''
        ? Number(value)
        : value;
    } else if (typeof value === 'boolean') {
      fields[key] = value;
    }
  });

  const payload = {
    ...fields,
    recordId,
    varEquipmentId,
    siteId,
  };

  const res = await fetch(`${SALESFORCE_REST_BASE_URL}${SALESFORCE_REST_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let result = null;
  try {
    result = await res.json();
  } catch (e) {
    // no-op; handled by the !res.ok / !result.success checks below
  }

  if (!res.ok || !result || result.success !== true) {
    const message = (result && result.message) || 'Salesforce submission failed';
    throw new Error(message);
  }
}

// -----------------------------
// Nav buttons: Save, Back, Next, Exit
// -----------------------------
const btnSave = document.getElementById('btnSave');
const btnBack = document.getElementById('btnBack');
const btnNext = document.getElementById('btnNext');
const btnExit = document.getElementById('btnExit');

if (btnSave) {
  btnSave.addEventListener('click', () => window.saveDraft());
}

if (btnBack) {
  btnBack.addEventListener('click', () => {
    saveDraftSilently(); // autosave on navigation
    showPage(currentPage - 1);
  });
}

if (btnNext) {
  btnNext.addEventListener('click', () => {
    saveDraftSilently(); // autosave on navigation
    showPage(currentPage + 1);
  });
}

if (btnExit) {
  btnExit.addEventListener('click', async () => {
    saveDraftSilently();
    try {
      await submitAssessment();
      localStorage.removeItem(DRAFT_KEY);

      const box = document.getElementById('resumeBox');
      const row = document.getElementById('resumeLinkRow');
      const title = document.getElementById('resumeBoxTitle');
      const message = document.getElementById('resumeBoxMessage');

      if (title) title.innerHTML = '<strong>Submitted</strong>';
      if (message) message.textContent = 'Your assessment has been saved and submitted. You can safely close this window now.';
      if (row) row.style.display = 'none';
      if (box) box.style.display = 'block';
    } catch (err) {
      console.error(err);
      alert('Submission failed. Your answers are saved as a draft — please try Exit again, or use Save to get a resume link.');
    }
  });
}

// -----------------------------
// Clear form
// -----------------------------
function confirmClearForm() {
  const confirmed = confirm(
    'This will permanently clear all fields on this form.\n\nThis action cannot be undone.\n\nDo you want to continue?'
  );

  if (!confirmed) {
    return;
  }

  clearForm();
}

function clearForm() {
  if (!form) return;

  form.reset();
  updateConditionals();
  showPage(0);

  const clearToken = location.hash.replace('#', '');
  if (clearToken) {
    localStorage.removeItem(`resume_${clearToken}`);
  }

  alert('Form cleared.');
}

window.confirmClearForm = confirmClearForm;

// -----------------------------
// Init
// -----------------------------
wireConditionals();
showPage(0);
