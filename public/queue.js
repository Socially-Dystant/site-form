// -----------------------------
// Offline Assessment Queue view
//
// This page is the technician's daily entry point, opened once each
// morning (while still online) from the "Open My Offline Queue" button in
// Salesforce, then reopened all day from the home screen / browser tab -
// including with zero signal. On that first online load it fetches and
// caches the full day's queue, with every field the form needs already
// resolved server-side (see OfflineAssessmentQueueController). After that,
// Start/Resume/Submit and returning here between sites are all local -
// no network required until Submit is actually pressed.
// -----------------------------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('Service worker registration failed', err);
  });
}

const params = new URLSearchParams(window.location.search);
const technicianId = params.get('technicianId');

const CACHE_KEY = `offlineQueueCache_${technicianId || 'none'}`;
const LOCAL_STATUS_KEY = `offlineQueueLocalStatus_${technicianId || 'none'}`;

const statusText = document.getElementById('queueStatusText');
const errorBanner = document.getElementById('queueError');
const listEl = document.getElementById('queueList');
const emptyEl = document.getElementById('queueEmpty');
const refreshBtn = document.getElementById('btnRefreshQueue');

function getLocalStatusMap() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STATUS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function setLocalStatus(queueId, status) {
  const map = getLocalStatusMap();
  map[queueId] = status;
  localStorage.setItem(LOCAL_STATUS_KEY, JSON.stringify(map));
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(items) {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ items, syncedAt: new Date().toISOString() })
  );
}

async function fetchQueueFromServer() {
  const res = await fetch(`/api/queue?technicianId=${encodeURIComponent(technicianId)}`);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // handled by the checks below
  }

  if (!res.ok || !data || data.success !== true) {
    const message = (data && data.message) || 'Unable to load your queue.';
    throw new Error(message);
  }

  return data.items || [];
}

function formatSyncedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
}

function buildFormUrl(item, action) {
  const queryParams = [
    `siteId=${encodeURIComponent(item.siteId)}`,
    `queueId=${encodeURIComponent(item.queueId)}`,
    `technicianId=${encodeURIComponent(technicianId)}`,
  ];

  if (item.accountId) {
    queryParams.push(`accountId=${encodeURIComponent(item.accountId)}`);
  }
  if (item.currentEquipmentId) {
    queryParams.push(`varEquipmentId=${encodeURIComponent(item.currentEquipmentId)}`);
  }
  if (item.serviceItemId) {
    queryParams.push(`recordId=${encodeURIComponent(item.serviceItemId)}`);
  }
  // Submit jumps straight to the form's last page for a quick review before
  // hitting its own Submit button, instead of paging through everything again.
  if (action === 'submit') {
    queryParams.push('startPage=last');
  }

  return `index.html?${queryParams.join('&')}`;
}

function handleAction(item, action) {
  if (action === 'start' || action === 'resume') {
    setLocalStatus(item.queueId, 'in-progress');
  }
  window.location.href = buildFormUrl(item, action);
}

function renderItems(items) {
  listEl.innerHTML = '';

  if (!items || !items.length) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const localStatus = getLocalStatusMap();

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'queue-card';

    const isCompleted = item.status === 'Completed';
    const isInProgress = !isCompleted && localStatus[item.queueId] === 'in-progress';

    const badgeLabel = isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started';
    const badgeClass = isCompleted ? 'queue-badge-completed' : isInProgress ? 'queue-badge-progress' : 'queue-badge-notstarted';

    const header = document.createElement('div');
    header.className = 'queue-card-header';
    header.innerHTML = `
      <span class="queue-site-name">${escapeHtml(item.siteName || 'Unnamed Site')}</span>
      <span class="queue-badge ${badgeClass}">${badgeLabel}</span>
    `;
    card.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'queue-card-actions';

    if (isCompleted) {
      const done = document.createElement('span');
      done.className = 'queue-completed-text';
      done.textContent = 'Submitted';
      actions.appendChild(done);
    } else if (isInProgress) {
      actions.appendChild(makeButton('Resume', 'resume', item, false));
      actions.appendChild(makeButton('Submit', 'submit', item, true));
    } else {
      actions.appendChild(makeButton('Start Assessment', 'start', item, true));
    }

    card.appendChild(actions);
    listEl.appendChild(card);
  });
}

function makeButton(label, action, item, primary) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = primary ? 'queue-btn-primary' : 'queue-btn-secondary';
  btn.addEventListener('click', () => handleAction(item, action));
  return btn;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function init() {
  if (!technicianId) {
    statusText.textContent = 'Missing technician context.';
    errorBanner.style.display = 'block';
    errorBanner.textContent =
      "This page needs to be opened from the 'Open My Offline Queue' button in Salesforce so it knows whose queue to load.";
    return;
  }

  const cached = readCache();
  if (cached) {
    renderItems(cached.items);
  }

  if (!navigator.onLine) {
    statusText.textContent = cached
      ? `Offline — showing your queue as of ${formatSyncedAt(cached.syncedAt)}`
      : "Offline — and no saved queue found on this device yet.";
    if (!cached) {
      errorBanner.style.display = 'block';
    }
    return;
  }

  statusText.textContent = 'Syncing your queue…';

  try {
    const items = await fetchQueueFromServer();
    writeCache(items);
    renderItems(items);
    errorBanner.style.display = 'none';
    statusText.textContent = `Synced just now`;
  } catch (err) {
    console.error('Queue sync failed', err);
    if (cached) {
      statusText.textContent = `Could not refresh — showing your queue as of ${formatSyncedAt(cached.syncedAt)}`;
    } else {
      statusText.textContent = 'Unable to load your queue.';
      errorBanner.style.display = 'block';
      errorBanner.textContent = err.message || 'Unable to load your queue.';
    }
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => init());
}

init();
