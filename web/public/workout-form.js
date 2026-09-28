import { clearFieldError, setFieldError } from './form-utils.js';

export const FIELDS = ['exercise_name', 'entry_date', 'duration_minutes', 'sets', 'reps'];

export const FIELD_ELEMENT_IDS = {
  exercise_name: 'exercise-name',
  entry_date: 'entry-date',
  duration_minutes: 'duration',
  sets: 'sets',
  reps: 'reps',
};

export function fieldElementId(field) {
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
