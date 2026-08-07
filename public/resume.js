const form = document.getElementById('siteForm');
const params = new URLSearchParams(window.location.search);
const token = location.hash.replace('#', '');

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

if (!token) {
  alert('Invalid or missing resume token.');
}

const saved = localStorage.getItem(`resume_${token}`);

if (!saved) {
  alert('Saved form data not found on this device.');
} else {
  const { data } = JSON.parse(saved);
  restoreFormData(form, data);
}

function resumeForm() {
  // Simply redirect back to main form with same context
  const siteId = params.get('siteId');
  const accountId = params.get('accountId');

  if (!siteId || !accountId) {
    alert('Missing Site or Account context.');
    return;
  }

  window.location.href =
    `/?siteId=${encodeURIComponent(siteId)}` +
    `&accountId=${encodeURIComponent(accountId)}` +
    `#${token}`;
}

window.resumeForm = resumeForm;
