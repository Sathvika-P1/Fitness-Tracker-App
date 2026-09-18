import { initials, clearFieldError, setFieldError } from './form-utils.js';

const DISPLAY_NAME_MAX_LENGTH = 50;

const FIELDS = ['display_name', 'units_preference', 'fitness_goal', 'height_cm', 'weight_kg', 'age', 'gender'];

function setFieldValue(name, value) {
  const el = document.getElementById(name.replace(/_/g, '-'));
  if (!el) return;
  el.value = value === null || value === undefined ? '' : String(value);
  el.classList.toggle('not-set', value === null || value === undefined);
}

export function renderProfile(data) {
  document.getElementById('header-name').textContent = data.display_name;
  document.getElementById('avatar-initial').textContent = initials(data.display_name);
  FIELDS.forEach((field) => setFieldValue(field, data[field]));
  const counter = document.getElementById('display-name-counter');
  const len = (data.display_name || '').length;
  counter.textContent = `${len} / ${DISPLAY_NAME_MAX_LENGTH}`;
  counter.classList.toggle('over', len > DISPLAY_NAME_MAX_LENGTH);
}

export function clearErrors() {
  FIELDS.forEach((field) => clearFieldError(field.replace(/_/g, '-')));
}

export function renderErrors(errors) {
  clearErrors();
  Object.entries(errors).forEach(([field, message]) => {
    setFieldError(field.replace(/_/g, '-'), `⚠ ${message}`);
  });
}

export async function loadProfile() {
  try {
    const res = await fetch('/api/profile', { credentials: 'include' });
    if (res.status !== 200) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    renderProfile(data);
  } catch (error) {
    console.error('profile_load_failed', { error });
    window.location.href = 'login.html';
  }
}

function collectFormValues() {
  const values = {};
  FIELDS.forEach((field) => {
    const el = document.getElementById(field.replace(/_/g, '-'));
    const raw = el.value.trim();
    if (raw !== '') {
      values[field] = raw;
    }
  });
  return values;
}

export async function saveProfile(formValues) {
  let res;
  try {
    res = await fetch('/api/profile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formValues),
    });
  } catch (error) {
    console.error('profile_save_failed', { error });
    return { ok: false, networkError: true };
  }
  if (res.status === 200) {
    return { ok: true };
  }
  if (res.status === 401) {
    return { ok: false, sessionExpired: true };
  }
  const body = await res.json();
  return { ok: false, errors: body.errors || {} };
}

const form = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name');
const saveButton = document.getElementById('save-button');
const savedBanner = document.getElementById('saved-banner');
const saveErrorBanner = document.getElementById('save-error-banner');

displayNameInput?.addEventListener('input', () => {
  const counter = document.getElementById('display-name-counter');
  const len = displayNameInput.value.length;
  counter.textContent = `${len} / ${DISPLAY_NAME_MAX_LENGTH}`;
  counter.classList.toggle('over', len > DISPLAY_NAME_MAX_LENGTH);
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  savedBanner.hidden = true;
  saveErrorBanner.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';
  try {
    const result = await saveProfile(collectFormValues());
    if (result.ok) {
      savedBanner.hidden = false;
      await loadProfile();
    } else if (result.sessionExpired) {
      window.location.href = 'login.html';
    } else if (result.networkError) {
      saveErrorBanner.hidden = false;
    } else {
      renderErrors(result.errors);
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save changes';
  }
});

if (document.getElementById('profile-form')) {
  loadProfile();
}
