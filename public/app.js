const form = document.getElementById('siteForm');

// Restore from localStorage
if (form) {
  const saved = localStorage.getItem('siteFormDraft');
  if (saved) {
    Object.entries(JSON.parse(saved)).forEach(([k,v])=>{
      if (form[k]) form[k].value = v;
    });
  }
}

// Resume via token
const token = location.hash.replace('#','');
if (token) {
  fetch(`/api/load/${token}`)
    .then(r => r.json())
    .then(data => {
      if (!data) return;
      Object.entries(data).forEach(([k,v])=>{
        if (form[k]) form[k].value = v;
      });
    });
}

// Save draft
window.saveDraft = async function () {
  const data = Object.fromEntries(new FormData(form));

  // Always save locally (offline-safe)
  localStorage.setItem('siteFormDraft', JSON.stringify(data));

  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const { token } = await res.json();

  const link =
    `${location.origin}/resume.html#${token}`;

  // Show copyable link
  const box = document.getElementById('resumeBox');
  const input = document.getElementById('resumeLink');

  input.value = link;
  box.style.display = 'block';

  // Auto-select for easy copy
  input.focus();
  input.select();
  input.setSelectionRange(0, 99999);
};
window.copyResumeLink = function () {
  const input = document.getElementById('resumeLink');
  input.select();
  input.setSelectionRange(0, 99999);

  navigator.clipboard.writeText(input.value).then(() => {
    const msg = document.getElementById('copyStatus');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);
  });
};


