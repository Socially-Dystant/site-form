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
  window.saveDraft = function () {
    if (!form) return;

    // 1️⃣ Capture form data
    const data = Object.fromEntries(new FormData(form));

    // 2️⃣ Generate a local token (offline-safe)
    const token = crypto.randomUUID();

    // 3️⃣ Save draft locally using token
    const payload = {
      siteId,
      accountId,
      data,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(`resume_${token}`, JSON.stringify(payload));

    // 4️⃣ Also save "latest draft" for quick reloads
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));

    // 5️⃣ Build resume URL locally (NO NETWORK)
    const link =
      `${location.origin}/resume.html` +
      `?siteId=${encodeURIComponent(siteId)}` +
      `&accountId=${encodeURIComponent(accountId)}` +
      `#${token}`;

    // 6️⃣ Show copyable URL popup
    const box = document.getElementById('resumeBox');
    const input = document.getElementById('resumeLink');

    input.value = link;
    box.style.display = 'block';

    input.focus();
    input.select();
    input.setSelectionRange(0, 99999);
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
    const form = document.getElementById('siteForm');
    if (!form) return;

    form.reset();

    // Optional: clear any local draft for this form
    const token = location.hash.replace('#', '');
    if (token) {
      localStorage.removeItem(`resume_${token}`);
    }

    // Optional UX feedback
    alert('Form cleared.');
  }

