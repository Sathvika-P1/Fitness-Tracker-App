import { logout as sharedLogout, goToHistoryDeleted } from './session-utils.js';

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

export function buildQueryString({ startDate, endDate, exerciseName, offset } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (exerciseName) params.set('exercise_name', exerciseName);
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function fetchPage(filters) {
  const res = await fetch(`/api/workouts${buildQueryString(filters)}`, { credentials: 'include' });
  if (res.status === 200) {
    const body = await res.json();
    return { ok: true, entries: body.entries || [], hasMore: Boolean(body.has_more) };
  }
  if (res.status === 401) {
    return { ok: false, sessionExpired: true };
  }
  if (res.status === 400) {
    const body = await res.json();
    return { ok: false, fieldErrors: body.errors || {} };
  }
  return { ok: false, networkError: true };
}

// AC1 requires the complete list on load, so pages are fetched and merged here
// rather than exposed as a "load more" control; pagination only bounds per-request cost.
export async function fetchHistory(filters) {
  try {
    const entries = [];
    let offset = 0;
    for (;;) {
      const page = await fetchPage({ ...filters, offset });
      if (!page.ok) return page;
      entries.push(...page.entries);
      if (!page.hasMore || page.entries.length === 0) break;
      offset += page.entries.length;
    }
    return { ok: true, entries };
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
const emptyStateClearBtn = document.getElementById('empty-state-clear-btn');
const historyStatus = document.getElementById('history-status');
const filterPanel = document.getElementById('filter-panel');
const entryCount = document.getElementById('entry-count');
const filterStart = document.getElementById('filter-start');
const filterEnd = document.getElementById('filter-end');
const filterName = document.getElementById('filter-name');
const applyBtn = document.getElementById('apply-filters-btn');
const clearBtn = document.getElementById('clear-filters-btn');
const loadErrorBanner = document.getElementById('load-error-banner');
const retryBtn = document.getElementById('retry-btn');
const updatedBanner = document.getElementById('updated-banner');
const deletedBanner = document.getElementById('deleted-banner');
const filterStartError = document.getElementById('filter-start-error');
const filterEndError = document.getElementById('filter-end-error');
const deleteBackdrop = document.getElementById('delete-backdrop');
const deleteConfirmBody = document.getElementById('delete-confirm-body');
const keepEntryBtn = document.getElementById('keep-entry-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

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

let highlightEntryId = null;

function consumeOneShotBanners() {
  const params = new URLSearchParams(window.location.search);
  const updatedId = params.get('updated');
  const deleted = params.get('deleted');
  if (updatedId) {
    updatedBanner.hidden = false;
    highlightEntryId = Number(updatedId) || null;
  }
  if (deleted) {
    deletedBanner.hidden = false;
  }
  if (updatedId || deleted) {
    const url = new URL(window.location.href);
    url.searchParams.delete('updated');
    url.searchParams.delete('deleted');
    window.history.replaceState(null, '', url.pathname + url.search);
  }
}

export function renderHistory(entries, filters = {}, highlightId = null) {
  historyList.innerHTML = '';
  const filterActive = hasActiveFilter(filters);

  if (entries.length === 0) {
    historyList.hidden = true;
    emptyState.hidden = false;
    if (filterActive) {
      emptyStateIcon.textContent = 'Ø';
      emptyStateTitle.textContent = 'No matching entries';
      emptyStateBody.textContent = 'No workouts match the selected filters. Try a different name or clear the filter.';
      emptyStateAction.hidden = true;
      emptyStateClearBtn.hidden = false;
    } else {
      emptyStateIcon.textContent = '＋';
      emptyStateTitle.textContent = 'No workouts logged yet';
      emptyStateBody.textContent = "Once you log a workout, it'll show up here — newest first.";
      emptyStateAction.hidden = false;
      emptyStateClearBtn.hidden = true;
    }
    entryCount.hidden = true;
    historyStatus.textContent = emptyStateTitle.textContent;
    return;
  }

  historyList.hidden = false;
  emptyState.hidden = true;
  entryCount.hidden = false;
  entryCount.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  historyStatus.textContent = entryCount.textContent;

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-row';
    if (highlightId != null && entry.id === highlightId) {
      li.classList.add('updated');
    }

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

    const editLink = document.createElement('a');
    editLink.className = 'btn btn-secondary history-edit-link icon-only-btn';
    editLink.href = `edit-workout.html?id=${entry.id}`;
    editLink.setAttribute('aria-label', 'Edit');
    editLink.title = 'Edit';
    editLink.innerHTML = '<span aria-hidden="true">✏️</span>';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-secondary history-delete-btn icon-only-btn';
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', 'Delete');
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = '<span aria-hidden="true">🗑️</span>';
    deleteBtn.addEventListener('click', () => openDeleteModal(entry, li, deleteBtn));

    const actionsEl = document.createElement('div');
    actionsEl.className = 'history-row-actions';
    actionsEl.appendChild(editLink);
    actionsEl.appendChild(deleteBtn);

    li.appendChild(main);
    li.appendChild(metricsEl);
    li.appendChild(actionsEl);
    historyList.appendChild(li);
  });
}

let pendingDelete = null;

function openDeleteModal(entry, row, deleteBtn) {
  pendingDelete = { entry, row, deleteBtn };
  deleteConfirmBody.textContent =
    `"${entry.exercise_name}" on ${formatDate(entry.entry_date)} will be permanently removed. This can't be undone.`;
  deleteBackdrop.hidden = false;
  keepEntryBtn?.focus();
}

function closeDeleteModal() {
  deleteBackdrop.hidden = true;
  pendingDelete?.deleteBtn?.focus();
  pendingDelete = null;
}

function clearRowError(row) {
  row.classList.remove('row-error');
  const errorRow = row.nextElementSibling;
  if (errorRow && errorRow.classList.contains('row-inline-error-item')) {
    errorRow.remove();
  }
}

function showRowError(entry, row, deleteBtn) {
  row.classList.add('row-error');
  const errorItem = document.createElement('li');
  errorItem.className = 'row-inline-error-item';
  const errorDiv = document.createElement('div');
  errorDiv.className = 'row-inline-error';
  errorDiv.setAttribute('role', 'alert');
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⚠';
  const message = document.createElement('span');
  message.textContent = "Couldn't delete this entry. Check your connection and try again.";
  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-secondary';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', () => performDelete(entry, row, deleteBtn));
  errorDiv.appendChild(icon);
  errorDiv.appendChild(message);
  errorDiv.appendChild(retryBtn);
  errorItem.appendChild(errorDiv);
  row.after(errorItem);
}

async function performDelete(entry, row, deleteBtn) {
  clearRowError(row);
  deleteBtn.disabled = true;
  deleteBtn.setAttribute('aria-label', 'Deleting…');
  deleteBtn.title = 'Deleting…';

  let res;
  try {
    res = await fetch(`/api/workouts/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch (error) {
    console.error('history_delete_failed', { error });
    deleteBtn.disabled = false;
    deleteBtn.setAttribute('aria-label', 'Delete');
    deleteBtn.title = 'Delete';
    showRowError(entry, row, deleteBtn);
    return;
  }

  if (res.status === 204 || res.status === 404) {
    goToHistoryDeleted();
    return;
  }
  if (res.status === 401) {
    window.location.href = 'login.html';
    return;
  }

  deleteBtn.disabled = false;
  deleteBtn.setAttribute('aria-label', 'Delete');
  deleteBtn.title = 'Delete';
  showRowError(entry, row, deleteBtn);
}

keepEntryBtn?.addEventListener('click', closeDeleteModal);

confirmDeleteBtn?.addEventListener('click', () => {
  if (!pendingDelete) return;
  const { entry, row, deleteBtn } = pendingDelete;
  deleteBackdrop.hidden = true;
  performDelete(entry, row, deleteBtn);
  pendingDelete = null;
});

document.addEventListener('keydown', (event) => {
  if (deleteBackdrop.hidden) return;
  if (event.key === 'Escape') {
    closeDeleteModal();
  }
});

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
      renderHistory(result.entries, filters, highlightEntryId);
      highlightEntryId = null;
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

emptyStateClearBtn?.addEventListener('click', () => {
  clearBtn.click();
});

export function logout() {
  return sharedLogout('history-logout-error');
}

document.getElementById('history-logout-btn')?.addEventListener('click', logout);

if (historyList) {
  consumeOneShotBanners();
  loadAndRender(currentFilters());
}
