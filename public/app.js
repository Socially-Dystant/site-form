// -----------------------------
// Context
// -----------------------------
const form = document.getElementById('siteForm');
const params = new URLSearchParams(window.location.search);

const siteId = params.get('siteId');
const accountId = params.get('accountId');

// Current_Equipment__c id, passed in by the launching LWC (same variable name
// as the Flow's own varEquipmentId). Service_Item__c is not written by this
// form — the Integration User this form submits through can never be granted
// access to that object, so all Service_Item__c-only questions have been
// removed from the form entirely (see project notes).
const varEquipmentId = params.get('varEquipmentId');

// Offline_Assessment_Queue__c id, passed in when this form is launched from
// the technician's daily queue list rather than directly from the Site
// record. When present, a successful submit flips that queue item's
// Status__c to "Completed".
const queueId = params.get('queueId');

// The technician's Salesforce User Id, passed through from the queue view
// (queue.js) so this page can link back to it. Only present when launched
// from the queue - direct Site-record launches (launchOfflineYearBuilt)
// don't have a queue to return to.
const technicianId = params.get('technicianId');

// -----------------------------
// Service worker registration - same app shell cache as queue.html, so this
// form keeps working (including for a Site never opened before) with no
// connection at all, once it's been loaded here once while online.
// -----------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('Service worker registration failed', err);
  });
}

// -----------------------------
// "Back to Queue" link - only shown when this form was launched from the
// technician's queue (both queueId and technicianId present).
// -----------------------------
if (queueId && technicianId) {
  const backLink = document.getElementById('queueBackLink');
  const backAnchor = document.getElementById('queueBackLinkAnchor');
  if (backLink && backAnchor) {
    backAnchor.href = `queue.html?technicianId=${encodeURIComponent(technicianId)}`;
    backLink.style.display = 'block';
  }
}

// Draft key is scoped per Site + Account (important)
const DRAFT_KEY = `siteFormDraft_${siteId || 'none'}_${accountId || 'none'}`;

// Fail fast if context is missing
if (!siteId || !accountId) {
  alert('Missing Site or Account context. Please launch this form from Salesforce.');
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
// Default Assessment Date to today. Runs before the draft/resume restores
// below, so a saved value (from an earlier session on this same site/account)
// still takes precedence over this default.
// -----------------------------
if (form && form.in_AssessmentDate && !form.in_AssessmentDate.value) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  form.in_AssessmentDate.value = `${yyyy}-${mm}-${dd}`;
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
// Save draft (offline-safe, same-device only — see app.js's DRAFT_KEY restore
// on load, and the Back/Next autosave calls below)
// -----------------------------
function saveDraftSilently() {
  if (!form) return;
  const data = serializeForm(form);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

window.saveDraft = function () {
  saveDraftSilently();
  showToast({
    title: 'Saved',
    message: (queueId && technicianId)
      ? "Your progress has been saved. Tap ← Back to Queue above to continue with your next site, or close this page."
      : 'Your progress has been saved. You can safely close this page now.',
  });
};

// -----------------------------
// Submit to Salesforce, via this app's own server (used by Exit / Save & Finish)
//
// The browser posts to this server's own /api/submit-assessment route, not to
// Salesforce directly. The server holds an OAuth Client Credentials token and
// forwards the request to the NrenAssessmentApi Apex REST resource, which saves
// straight into Site__c / Current_Equipment__c using the Flow's own field API
// names. Service_Item__c is intentionally not written here — the Integration
// User this form submits through can never be granted access to that object,
// so this form no longer collects Service_Item__c-only answers. This avoids
// exposing Salesforce credentials in browser JS and avoids needing a CORS
// whitelist entry in Salesforce (same-origin call). It replaces the previous
// Power Automate hop.
// -----------------------------

// Property info fields (Site__c "Information" section) whose real Salesforce
// field type wasn't confirmed ahead of time (Number vs. Text). These are
// always sent as JSON strings, matching the String-typed fields on the Apex
// side, which coerces to whatever type each field actually is at write time.
const KEEP_AS_STRING_FIELDS = new Set([
  'in_BuildingVintageYear',
  'in_NumberOfBedrooms',
  'in_NumberOfBathrooms',
  'in_AreaSquareFeet',
  'in_NAICSCode',
]);

async function submitAssessment() {
  const rawFields = serializeForm(form);
  const fields = {};
  Object.entries(rawFields).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Salesforce multi-select picklists expect a single ";"-delimited string,
      // not a JSON array.
      if (value.length) fields[key] = value.join(';');
    } else if (value !== '' && value !== false) {
      fields[key] = (!KEEP_AS_STRING_FIELDS.has(key) && typeof value === 'string' && !isNaN(value) && value.trim() !== '')
        ? Number(value)
        : value;
    } else if (typeof value === 'boolean') {
      fields[key] = value;
    }
  });

  const payload = {
    ...fields,
    varEquipmentId,
    siteId,
    queueId,
  };

  const res = await fetch('/api/submit-assessment', {
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
// Success toast (shown on Submit)
// -----------------------------
let toastHideTimer = null;

function showToast({ title, message, durationMs = 6000 } = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const titleEl = document.getElementById('toastTitle');
  const messageEl = document.getElementById('toastMessage');
  if (titleEl && title) titleEl.textContent = title;
  if (messageEl && message) messageEl.textContent = message;

  toast.classList.add('visible');

  if (toastHideTimer) clearTimeout(toastHideTimer);
  if (durationMs > 0) {
    toastHideTimer = setTimeout(hideToast, durationMs);
  }
}

function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('visible');
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
}

window.hideToast = hideToast;

// -----------------------------
// Nav buttons: Save and Exit, Back, Next, Submit
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

      showToast({
        title: 'Submitted',
        message: (queueId && technicianId)
          ? "Your assessment has been submitted. Tap ← Back to Queue above to continue with your next site, or close this tab."
          : 'Your assessment has been submitted. You can safely close this tab now.',
      });
    } catch (err) {
      console.error(err);
      alert('Submission failed. Your answers are saved as a draft — please try Submit again, or use Save and Exit to get a resume link.');
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

// The Queue list's Submit action links here with startPage=last, jumping
// straight to the final page for a quick review before hitting the form's
// own Submit button, instead of paging through everything again.
const startPage = params.get('startPage');
showPage(startPage === 'last' ? totalPages - 1 : 0);
