import { logout as sharedLogout } from './session-utils.js';

export function formatMetrics(entry) {
  const metrics = [];
  if (entry.duration_minutes != null) {
    metrics.push({ val: `${entry.duration_minutes}`, unit: 'minutes' });
  }
  if (entry.sets != null && entry.reps != null) {
    metrics.push({ val: `${entry.sets} × ${entry.reps}`, unit: 'sets × reps' });
  }
  return metrics;
}

export function buildQueryString({ startDate, endDate, exerciseName } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (exerciseName) params.set('exercise_name', exerciseName);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchHistory(filters) {
  try {
    const res = await fetch(`/api/workouts${buildQueryString(filters)}`, { credentials: 'include' });
    if (res.status === 200) {
      const body = await res.json();
      return { ok: true, entries: body.entries || [] };
    }
    if (res.status === 401) {
      return { ok: false, sessionExpired: true };
    }
    if (res.status === 400) {
      const body = await res.json();
      return { ok: false, fieldErrors: body.errors || {} };
    }
    return { ok: false, networkError: true };
  } catch (error) {
    console.error('history_fetch_failed', { error });
    return { ok: false, networkError: true };
  }
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const historyList = document.getElementById('history-list');
const emptyState = document.getElementById('empty-state');
const emptyStateIcon = document.getElementById('empty-state-icon');
const emptyStateTitle = document.getElementById('empty-state-title');
const emptyStateBody = document.getElementById('empty-state-body');
const emptyStateAction = document.getElementById('empty-state-action');
const filterPanel = document.getElementById('filter-panel');
const entryCount = document.getElementById('entry-count');
const filterStart = document.getElementById('filter-start');
const filterEnd = document.getElementById('filter-end');
const filterName = document.getElementById('filter-name');
const applyBtn = document.getElementById('apply-filters-btn');
const clearBtn = document.getElementById('clear-filters-btn');
const loadErrorBanner = document.getElementById('load-error-banner');
const retryBtn = document.getElementById('retry-btn');
const filterStartError = document.getElementById('filter-start-error');
const filterEndError = document.getElementById('filter-end-error');

function setFieldError(el, message) {
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function currentFilters() {
  return {
    startDate: filterStart?.value || '',
    endDate: filterEnd?.value || '',
    exerciseName: filterName?.value.trim() || '',
  };
}

function hasActiveFilter(filters) {
  return Boolean(filters.startDate || filters.endDate || filters.exerciseName);
}

export function renderHistory(entries, filters = {}) {
  historyList.innerHTML = '';
  const filterActive = hasActiveFilter(filters);

  if (entries.length === 0) {
    historyList.hidden = true;
    emptyState.hidden = false;
    if (filterActive) {
      emptyStateIcon.textContent = 'Ø';
      emptyStateTitle.textContent = 'No matching entries';
      emptyStateBody.textContent = 'No workouts match the selected filters. Try a different name or clear the filter.';
      emptyStateAction.textContent = 'Clear filter →';
      emptyStateAction.removeAttribute('href');
    } else {
      emptyStateIcon.textContent = '＋';
      emptyStateTitle.textContent = 'No workouts logged yet';
      emptyStateBody.textContent = "Once you log a workout, it'll show up here — newest first.";
      emptyStateAction.textContent = 'Log your first workout →';
      emptyStateAction.setAttribute('href', 'workout-entry.html');
    }
    entryCount.hidden = true;
    return;
  }

  historyList.hidden = false;
  emptyState.hidden = true;
  entryCount.hidden = false;
  entryCount.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-row';

    const main = document.createElement('div');
    main.className = 'history-row-main';
    const nameEl = document.createElement('span');
    nameEl.className = 'history-exercise';
    nameEl.textContent = entry.exercise_name;
    const dateEl = document.createElement('span');
    dateEl.className = 'history-date';
    dateEl.textContent = formatDate(entry.entry_date);
    main.appendChild(nameEl);
    main.appendChild(dateEl);

    const metricsEl = document.createElement('div');
    metricsEl.className = 'history-metrics';
    formatMetrics(entry).forEach(({ val, unit }) => {
      const metric = document.createElement('div');
      metric.className = 'history-metric';
      const valEl = document.createElement('span');
      valEl.className = 'val';
      valEl.textContent = val;
      const unitEl = document.createElement('span');
      unitEl.className = 'unit';
      unitEl.textContent = unit;
      metric.appendChild(valEl);
      metric.appendChild(unitEl);
      metricsEl.appendChild(metric);
    });

    li.appendChild(main);
    li.appendChild(metricsEl);
    historyList.appendChild(li);
  });
}

let requestInFlight = false;

async function loadAndRender(filters) {
  if (requestInFlight) return;
  requestInFlight = true;
  applyBtn?.setAttribute('disabled', 'true');
  clearBtn?.setAttribute('disabled', 'true');
  retryBtn?.setAttribute('disabled', 'true');
  loadErrorBanner.hidden = true;
  setFieldError(filterStartError, '');
  setFieldError(filterEndError, '');
  try {
    const result = await fetchHistory(filters);
    if (result.ok) {
      renderHistory(result.entries, filters);
    } else if (result.sessionExpired) {
      window.location.href = 'login.html';
    } else if (result.fieldErrors && (result.fieldErrors.start_date || result.fieldErrors.end_date)) {
      setFieldError(filterStartError, result.fieldErrors.start_date);
      setFieldError(filterEndError, result.fieldErrors.end_date);
    } else {
      loadErrorBanner.hidden = false;
    }
  } finally {
    requestInFlight = false;
    applyBtn?.removeAttribute('disabled');
    retryBtn?.removeAttribute('disabled');
    const filterActive = hasActiveFilter(currentFilters());
    if (clearBtn) {
      clearBtn.disabled = !filterActive;
      clearBtn.title = clearBtn.disabled ? 'No filter is currently active' : '';
    }
  }
}

applyBtn?.addEventListener('click', () => {
  loadAndRender(currentFilters());
});

clearBtn?.addEventListener('click', () => {
  filterStart.value = '';
  filterEnd.value = '';
  filterName.value = '';
  loadAndRender(currentFilters());
});

retryBtn?.addEventListener('click', () => {
  loadAndRender(currentFilters());
});

emptyStateAction?.addEventListener('click', (event) => {
  if (emptyStateAction.hasAttribute('href')) return;
  event.preventDefault();
  clearBtn.click();
});

export function logout() {
  return sharedLogout('history-logout-error');
}

document.getElementById('history-logout-btn')?.addEventListener('click', logout);

if (historyList) {
  loadAndRender(currentFilters());
}
