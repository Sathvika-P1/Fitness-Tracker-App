import { logout as sharedLogout } from './session-utils.js';
import {
  collectFormValues,
  renderValidationErrors,
  clearValidationErrors,
  todayIsoDate,
} from './workout-form.js';

export function entryIdFromLocation(location) {
  return new URLSearchParams(location.search).get('id');
}

export async function fetchEntry(entryId) {
  let res;
  try {
    res = await fetch(`/api/workouts/${encodeURIComponent(entryId)}`, { credentials: 'include' });
  } catch (error) {
    console.error('workout_edit_load_failed', { error });
    return { ok: false, networkError: true };
  }
  if (res.status === 200) {
    return { ok: true, entry: await res.json() };
  }
  if (res.status === 401) {
    return { ok: false, sessionExpired: true };
  }
  if (res.status === 403 || res.status === 404) {
    const body = await res.json();
    return { ok: false, status: res.status, message: body.message };
  }
  return { ok: false, networkError: true };
}

export async function submitUpdate(entryId, values) {
  let res;
  try {
    res = await fetch(`/api/workouts/${encodeURIComponent(entryId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
  } catch (error) {
    console.error('workout_edit_save_failed', { error });
    return { ok: false, networkError: true };
  }
  if (res.status === 200) {
    return { ok: true, entry: await res.json() };
  }
  if (res.status === 401) {
    return { ok: false, sessionExpired: true };
  }
  if (res.status === 400) {
    const body = await res.json();
    return { ok: false, errors: body.errors || {} };
  }
  if (res.status === 403 || res.status === 404) {
    const body = await res.json();
    return { ok: false, status: res.status, message: body.message };
  }
  return { ok: false, networkError: true };
}

const form = document.getElementById('edit-form');
const loadingSkeleton = document.getElementById('loading-skeleton');
const loadErrorBanner = document.getElementById('load-error-banner');
const loadErrorBody = document.getElementById('load-error-body');
const loadRetryBtn = document.getElementById('load-retry-btn');
const saveErrorBanner = document.getElementById('save-error-banner');
const saveButton = document.getElementById('save-button');
const cancelBtn = document.getElementById('cancel-btn');
const discardBackdrop = document.getElementById('discard-backdrop');
const keepEditingBtn = document.getElementById('keep-editing-btn');
const discardBtn = document.getElementById('discard-btn');
const exerciseInput = document.getElementById('exercise-name');
const dateInput = document.getElementById('entry-date');
const durationInput = document.getElementById('duration');
const setsInput = document.getElementById('sets');
const repsInput = document.getElementById('reps');

let entryId = null;
let formDirty = false;

function fillForm(entry) {
  exerciseInput.value = entry.exercise_name || '';
  dateInput.value = entry.entry_date || '';
  dateInput.max = todayIsoDate();
  durationInput.value = entry.duration_minutes != null ? entry.duration_minutes : '';
  setsInput.value = entry.sets != null ? entry.sets : '';
  repsInput.value = entry.reps != null ? entry.reps : '';
}

function markDirty() {
  formDirty = true;
}

[exerciseInput, dateInput, durationInput, setsInput, repsInput].forEach((input) => {
  input?.addEventListener('input', markDirty);
});

function goToHistoryDeleted() {
  window.location.href = 'history.html?deleted=1';
}

export async function loadEntry() {
  entryId = entryIdFromLocation(window.location);
  loadingSkeleton.hidden = false;
  form.hidden = true;
  loadErrorBanner.hidden = true;

  const result = await fetchEntry(entryId);
  loadingSkeleton.hidden = true;

  if (result.ok) {
    fillForm(result.entry);
    form.hidden = false;
  } else if (result.sessionExpired) {
    window.location.href = 'login.html';
  } else if (result.status === 404) {
    goToHistoryDeleted();
  } else if (result.status === 403) {
    loadErrorBody.textContent = result.message;
    loadErrorBanner.hidden = false;
    loadRetryBtn.hidden = true;
    form.hidden = true;
  } else {
    loadErrorBody.textContent = "Couldn't load this workout. Check your connection and try again.";
    loadErrorBanner.hidden = false;
    loadRetryBtn.hidden = false;
    form.hidden = true;
  }
}

loadRetryBtn?.addEventListener('click', () => {
  loadRetryBtn.hidden = false;
  loadEntry();
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearValidationErrors();
  saveErrorBanner.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';
  try {
    const result = await submitUpdate(entryId, collectFormValues());
    if (result.ok) {
      formDirty = false;
      window.location.href = `history.html?updated=${encodeURIComponent(entryId)}`;
    } else if (result.sessionExpired) {
      window.location.href = 'login.html';
    } else if (result.status === 404) {
      goToHistoryDeleted();
    } else if (result.status === 403) {
      loadErrorBody.textContent = result.message;
      loadErrorBanner.hidden = false;
      loadRetryBtn.hidden = true;
      form.hidden = true;
    } else if (result.errors) {
      renderValidationErrors(result.errors);
    } else {
      saveErrorBanner.hidden = false;
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save changes';
  }
});

function openDiscardModal() {
  discardBackdrop.hidden = false;
}

function closeDiscardModal() {
  discardBackdrop.hidden = true;
}

cancelBtn?.addEventListener('click', () => {
  if (formDirty) {
    openDiscardModal();
  } else {
    window.location.href = 'history.html';
  }
});

keepEditingBtn?.addEventListener('click', closeDiscardModal);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !discardBackdrop.hidden) {
    closeDiscardModal();
  }
});

export function logout() {
  return sharedLogout('edit-logout-error');
}

document.getElementById('edit-logout-btn')?.addEventListener('click', logout);

if (form) {
  loadEntry();
}
