import { logout as sharedLogout } from './session-utils.js';
import { formatMealDateTime } from './meal-form.js';

export async function fetchHistory() {
  try {
    const res = await fetch('/api/meals', { credentials: 'include' });
    if (res.status === 200) {
      const body = await res.json();
      return { ok: true, entries: body.entries || [] };
    }
    if (res.status === 401) {
      return { ok: false, sessionExpired: true };
    }
    return { ok: false, networkError: true };
  } catch (error) {
    console.error('diet_history_fetch_failed', { error });
    return { ok: false, networkError: true };
  }
}

const historyList = document.getElementById('history-list');
const emptyState = document.getElementById('empty-state');
const historyStatus = document.getElementById('diet-history-status');
const entryCount = document.getElementById('entry-count');
const loadErrorBanner = document.getElementById('load-error-banner');
const retryBtn = document.getElementById('retry-btn');
const noActionsNote = document.getElementById('no-actions-note');
const tzNote = document.getElementById('tz-note');
const tzNoteText = document.getElementById('tz-note-text');

export function renderHistory(entries) {
  historyList.innerHTML = '';

  if (entries.length === 0) {
    historyList.hidden = true;
    emptyState.hidden = false;
    entryCount.hidden = true;
    noActionsNote.hidden = true;
    tzNote.hidden = true;
    historyStatus.textContent = 'No meals logged yet';
    return;
  }

  historyList.hidden = false;
  emptyState.hidden = true;
  entryCount.hidden = false;
  entryCount.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  historyStatus.textContent = entryCount.textContent;
  noActionsNote.hidden = false;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  tzNote.hidden = false;
  tzNoteText.textContent = `Times shown in your device's local timezone (${timeZone}).`;

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-row';

    const main = document.createElement('div');
    main.className = 'history-row-main';

    const titleEl = document.createElement('span');
    titleEl.className = 'history-title';
    const chip = document.createElement('span');
    chip.className = 'entry-type-chip meal';
    chip.textContent = 'Meal';
    titleEl.appendChild(chip);
    titleEl.appendChild(document.createTextNode(' Meal entry'));

    const dateEl = document.createElement('span');
    dateEl.className = 'history-datetime';
    dateEl.textContent = formatMealDateTime(entry.eaten_at_utc, timeZone);

    main.appendChild(titleEl);
    main.appendChild(dateEl);

    const metricsEl = document.createElement('div');
    metricsEl.className = 'history-metrics';

    function metric(val, unit) {
      const el = document.createElement('div');
      el.className = 'history-metric';
      const valEl = document.createElement('span');
      valEl.className = 'val';
      valEl.textContent = val;
      const unitEl = document.createElement('span');
      unitEl.className = 'unit';
      unitEl.textContent = unit;
      el.appendChild(valEl);
      el.appendChild(unitEl);
      return el;
    }

    metricsEl.appendChild(metric(entry.calories, 'kcal'));
    metricsEl.appendChild(
      metric(`${entry.carbs_g}/${entry.protein_g}/${entry.fat_g}`, 'C/P/F (g)')
    );

    li.appendChild(main);
    li.appendChild(metricsEl);
    historyList.appendChild(li);
  });
}

let requestInFlight = false;

async function loadAndRender() {
  if (requestInFlight) return;
  requestInFlight = true;
  retryBtn?.setAttribute('disabled', 'true');
  loadErrorBanner.hidden = true;
  try {
    const result = await fetchHistory();
    if (result.ok) {
      renderHistory(result.entries);
    } else if (result.sessionExpired) {
      window.location.href = 'login.html';
    } else {
      loadErrorBanner.hidden = false;
    }
  } finally {
    requestInFlight = false;
    retryBtn?.removeAttribute('disabled');
  }
}

retryBtn?.addEventListener('click', () => {
  loadAndRender();
});

export function logout() {
  return sharedLogout('diet-history-logout-error');
}

document.getElementById('diet-history-logout-btn')?.addEventListener('click', logout);

if (historyList) {
  loadAndRender();
}
