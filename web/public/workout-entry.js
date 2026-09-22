import { clearFieldError, setFieldError } from './form-utils.js';
import { logout as sharedLogout } from './session-utils.js';

const FIELDS = ['exercise_name', 'entry_date', 'duration_minutes', 'sets', 'reps'];

const FIELD_ELEMENT_IDS = {
  exercise_name: 'exercise-name',
  entry_date: 'entry-date',
  duration_minutes: 'duration',
  sets: 'sets',
  reps: 'reps',
};

function fieldElementId(field) {
  return FIELD_ELEMENT_IDS[field] || field.replace(/_/g, '-');
}

export function collectFormValues() {
  const values = {};
  FIELDS.forEach((field) => {
    const el = document.getElementById(fieldElementId(field));
    values[field] = el ? el.value.trim() : '';
  });
  return values;
}

export function filterSuggestions(names, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return names.filter((name) => name.toLowerCase().includes(q));
}

export function renderValidationErrors(errors) {
  FIELDS.forEach((field) => clearFieldError(fieldElementId(field)));
  clearFieldError('entry');
  Object.entries(errors).forEach(([field, message]) => {
    setFieldError(fieldElementId(field), `⚠ ${message}`);
    const input = document.getElementById(fieldElementId(field));
    if (input) input.setAttribute('aria-invalid', 'true');
  });
}

export function clearValidationErrors() {
  FIELDS.forEach((field) => {
    clearFieldError(fieldElementId(field));
    const input = document.getElementById(fieldElementId(field));
    if (input) input.removeAttribute('aria-invalid');
  });
  clearFieldError('entry');
}

export async function submitEntry(values) {
  let res;
  try {
    res = await fetch('/api/workouts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
  } catch (error) {
    console.error('workout_save_failed', { error });
    return { ok: false, networkError: true };
  }
  if (res.status === 201) {
    return { ok: true, entry: await res.json() };
  }
  if (res.status === 401) {
    return { ok: false, sessionExpired: true };
  }
  if (res.status === 400) {
    const body = await res.json();
    return { ok: false, errors: body.errors || {} };
  }
  return { ok: false, networkError: true };
}

const form = document.getElementById('workout-form');
const exerciseInput = document.getElementById('exercise-name');
const acList = document.getElementById('ac-list');
const saveButton = document.getElementById('save-button');
const saveErrorBanner = document.getElementById('save-error-banner');
const sessionExpiredBanner = document.getElementById('session-expired-banner');
const confirmBox = document.getElementById('confirm-box');
const logAnotherBtn = document.getElementById('log-another-btn');

let pastExerciseNames = [];

async function loadExerciseNames() {
  try {
    const res = await fetch('/api/workouts/exercise-names', { credentials: 'include' });
    if (res.status !== 200) return;
    const body = await res.json();
    pastExerciseNames = body.names || [];
  } catch (error) {
    console.error('load_exercise_names_failed', { error });
  }
}

function renderSuggestions(matches) {
  acList.innerHTML = '';
  if (matches.length === 0) {
    acList.hidden = true;
    exerciseInput?.setAttribute('aria-expanded', 'false');
    return;
  }
  matches.forEach((name) => {
    const li = document.createElement('li');
    li.className = 'autocomplete-option';
    li.setAttribute('role', 'option');
    li.textContent = name;
    li.addEventListener('click', () => {
      exerciseInput.value = name;
      acList.hidden = true;
      exerciseInput.setAttribute('aria-expanded', 'false');
    });
    acList.appendChild(li);
  });
  acList.hidden = false;
  exerciseInput?.setAttribute('aria-expanded', 'true');
}

exerciseInput?.addEventListener('input', () => {
  renderSuggestions(filterSuggestions(pastExerciseNames, exerciseInput.value));
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearValidationErrors();
  saveErrorBanner.hidden = true;
  sessionExpiredBanner.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';
  try {
    const result = await submitEntry(collectFormValues());
    if (result.ok) {
      form.hidden = true;
      confirmBox.hidden = false;
      form.reset();
    } else if (result.sessionExpired) {
      sessionExpiredBanner.hidden = false;
    } else if (result.networkError) {
      saveErrorBanner.hidden = false;
    } else {
      renderValidationErrors(result.errors);
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save workout →';
  }
});

logAnotherBtn?.addEventListener('click', () => {
  confirmBox.hidden = true;
  form.hidden = false;
});

export function logout() {
  return sharedLogout('workout-logout-error');
}

document.getElementById('workout-logout-btn')?.addEventListener('click', logout);

const dateInput = document.getElementById('entry-date');
if (dateInput && !dateInput.value) {
  const today = new Date().toISOString().slice(0, 10);
  dateInput.value = today;
  dateInput.max = today;
}

if (exerciseInput) {
  loadExerciseNames();
}
