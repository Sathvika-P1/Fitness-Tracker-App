import { logout as sharedLogout } from './session-utils.js';
import { formatMealDateTime } from './meal-form.js';

const PAGE_SIZE = 25;

export async function fetchPage(page) {
  const offset = (page - 1) * PAGE_SIZE;
  try {
    const res = await fetch(`/api/meals?limit=${PAGE_SIZE}&offset=${offset}`, {
      credentials: 'include',
    });
    if (res.status === 200) {
      const body = await res.json();
      return {
        ok: true,
        entries: body.entries || [],
        hasMore: Boolean(body.has_more),
        totalCount: body.total_count || 0,
      };
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
const loadErrorTitle = document.getElementById('load-error-title');
const loadErrorBody = document.getElementById('load-error-body');
const retryBtn = document.getElementById('retry-btn');
const backToFirstBtn = document.getElementById('back-to-first-btn');
const noActionsNote = document.getElementById('no-actions-note');
const tzNote = document.getElementById('tz-note');
const tzNoteText = document.getElementById('tz-note-text');
const pagination = document.getElementById('pagination');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageStatus = document.getElementById('page-status');

function renderMetric(container, val, unit) {
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
  container.appendChild(el);
}

export function renderHistory(entries, page, totalCount) {
  historyList.innerHTML = '';

  if (entries.length === 0 && totalCount === 0) {
    historyList.hidden = true;
    emptyState.hidden = false;
    entryCount.hidden = true;
    noActionsNote.hidden = true;
    tzNote.hidden = true;
    pagination.hidden = true;
    historyStatus.textContent = 'No meals logged yet';
    return;
  }

  historyList.hidden = false;
  emptyState.hidden = true;
  entryCount.hidden = false;

  const firstIndex = (page - 1) * PAGE_SIZE + 1;
  const lastIndex = firstIndex + entries.length - 1;
  entryCount.textContent = `Showing ${firstIndex}–${lastIndex} of ${totalCount} meals`;
  historyStatus.textContent = entryCount.textContent;
  noActionsNote.hidden = false;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  tzNote.hidden = false;
  tzNoteText.textContent = `Times shown in your device's local timezone (${timeZone}).`;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  pagination.hidden = false;
  pageStatus.textContent = `Page ${page} of ${totalPages}`;
  prevPageBtn.disabled = page <= 1;
  prevPageBtn.setAttribute('aria-disabled', String(page <= 1));
  nextPageBtn.disabled = page >= totalPages;
  nextPageBtn.setAttribute('aria-disabled', String(page >= totalPages));

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-row';

    const main = document.createElement('div');
    main.className = 'history-row-main';

    const titleEl = document.createElement('span');
    titleEl.className = 'history-title';
    titleEl.textContent = entry.food_name ? entry.food_name : 'Meal';
    if (entry.quantity) {
      const qtyEl = document.createElement('span');
      qtyEl.className = 'text-muted text-sm';
      qtyEl.textContent = ` (${entry.quantity})`;
      titleEl.appendChild(qtyEl);
    }

    const dateEl = document.createElement('span');
    dateEl.className = 'history-datetime';
    dateEl.textContent = formatMealDateTime(entry.eaten_at_utc, timeZone);

    main.appendChild(titleEl);
    main.appendChild(dateEl);

    const metricsEl = document.createElement('div');
    metricsEl.className = 'history-metrics';

    renderMetric(metricsEl, entry.calories, 'kcal');
    renderMetric(metricsEl, `${entry.carbs_g} g`, 'Carbs');
    renderMetric(metricsEl, `${entry.protein_g} g`, 'Protein');
    renderMetric(metricsEl, `${entry.fat_g} g`, 'Fat');

    li.appendChild(main);
    li.appendChild(metricsEl);
    historyList.appendChild(li);
  });
}

let currentPage = 1;
let pendingPage = 1;
let currentTotalPages = 1;
let requestInFlight = false;

function setControlsDisabled(disabled) {
  retryBtn?.toggleAttribute('disabled', disabled);
  prevPageBtn?.toggleAttribute('disabled', disabled || currentPage <= 1);
  nextPageBtn?.toggleAttribute('disabled', disabled || currentPage >= currentTotalPages);
  backToFirstBtn?.toggleAttribute('disabled', disabled);
}

async function load(page, { isPageTurn = false } = {}) {
  if (requestInFlight) return;
  requestInFlight = true;
  pendingPage = page;
  setControlsDisabled(true);
  loadErrorBanner.hidden = true;
  try {
    const result = await fetchPage(page);
    if (result.ok) {
      currentPage = page;
      currentTotalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
      renderHistory(result.entries, page, result.totalCount);
    } else if (result.sessionExpired) {
      window.location.href = 'login.html';
    } else {
      loadErrorBanner.hidden = false;
      historyList.innerHTML = '';
      historyList.hidden = true;
      pagination.hidden = true;
      entryCount.hidden = true;
      tzNote.hidden = true;
      noActionsNote.hidden = true;
      emptyState.hidden = true;
      if (isPageTurn) {
        loadErrorTitle.textContent = "Couldn't load the next page";
        loadErrorBody.textContent =
          'Something went wrong while fetching more entries. Check your connection and try again.';
        backToFirstBtn.hidden = false;
        historyStatus.textContent = "Couldn't load the next page";
      } else {
        loadErrorTitle.textContent = "Couldn't load your meal history";
        loadErrorBody.textContent =
          'Something went wrong while fetching your entries. Check your connection and try again.';
        backToFirstBtn.hidden = true;
        historyStatus.textContent = "Couldn't load your meal history";
      }
    }
  } finally {
    requestInFlight = false;
    setControlsDisabled(false);
  }
}

retryBtn?.addEventListener('click', () => {
  load(pendingPage, { isPageTurn: pendingPage > 1 });
});

backToFirstBtn?.addEventListener('click', () => {
  load(1);
});

prevPageBtn?.addEventListener('click', () => {
  load(currentPage - 1, { isPageTurn: true });
});

nextPageBtn?.addEventListener('click', () => {
  load(currentPage + 1, { isPageTurn: true });
});

export function logout() {
  return sharedLogout('diet-history-logout-error');
}

document.getElementById('diet-history-logout-btn')?.addEventListener('click', logout);

if (historyList) {
  load(1);
}
