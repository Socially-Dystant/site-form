// -----------------------------
// Context
// -----------------------------
const form = document.getElementById('siteForm');
const params = new URLSearchParams(window.location.search);

const siteId = params.get('siteId');
const accountId = params.get('accountId');

// Draft key is scoped per Site + Account (important)
const DRAFT_KEY = `siteFormDraft_${siteId || 'none'}_${accountId || 'none'}`;

// Fail fast if context is missing
if (!siteId || !accountId) {
  alert('Missing Site or Account context. Please launch this form from Salesforce.');
}

// -----------------------------
// Restore from localStorage
// -----------------------------
if (form) {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    try {
      Object.entries(JSON.parse(saved)).forEach(([k, v]) => {
        if (form[k]) form[k].value = v;
      });
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
    .then(r => r.json())
    .then(data => {
      if (!data) return;
      Object.entries(data).forEach(([k, v]) => {
        if (form && form[k]) form[k].value = v;
      });
    })
    .catch(err => console.error('Resume load failed', err));
}

// -----------------------------
// Save draft (offline-safe)
// -----------------------------
window.saveDraft = async function () {
  if (!form) return;

  const data = Object.fromEntries(new FormData(form));

  // Save locally (offline works)
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));

  // Save to server for resume links
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const { token } = await res.json();

  // Preserve Site + Account context in resume link
  const link =
    `${location.origin}/resume.html` +
    `?siteId=${encodeURIComponent(siteId)}` +
    `&accountId=${encodeURIComponent(accountId)}` +
    `#${token}`;

  const box = document.getElementById('resumeBox');
  const input = document.getElementById('resumeLink');

  if (box && input) {
    input.value = link;
    box.style.display = 'block';

    // Auto-select for easy copy
    input.focus();
    input.select();
    input.setSelectionRange(0, 99999);
  } else {
    // Fallback (should rarely happen)
    window.prompt('Copy this resume link:', link);
  }
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
// Submit to Power Automate
// -----------------------------
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fields = {};
    document.querySelectorAll('[name]').forEach(el => {
      if (el.value !== '') {
        fields[el.name] = isNaN(el.value) ? el.value : Number(el.value);
      }
    });

    try {
      const res = await fetch(
        'https://defaultf5103fa7777c4870bbd0f1f33e796b.96.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/d23cee139ae249e1a6f25702376be730/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=-7pRHP5ITY7-l86MAi-AZj4YNDGk7lkwKydelJOa6Uc',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            accountId,
            fields
          })
        }
      );

      if (!res.ok) {
        throw new Error('Power Automate submission failed');
      }

      // Clear local draft after successful submit
      localStorage.removeItem(DRAFT_KEY);

      alert('Submitted successfully!');
    } catch (err) {
      console.error(err);
      alert('Submission failed. Please try again.');
    }
  });
}
