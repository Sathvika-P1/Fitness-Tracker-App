import { clearFieldError, setFieldError } from './form-utils.js';

export const FIELDS = ['calories', 'carbs_g', 'protein_g', 'fat_g', 'date', 'time'];

export const FIELD_ELEMENT_IDS = {
  calories: 'cal',
  carbs_g: 'carbs',
  protein_g: 'protein',
  fat_g: 'fat',
  date: 'meal-date',
  time: 'meal-time',
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
  values.utc_offset_minutes = String(
    computeUtcOffsetMinutes(values.date, values.time)
  );
  return values;
}

export function computeUtcOffsetMinutes(dateStr, timeStr) {
  const parsed = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTimezoneOffset();
}

export function renderValidationErrors(errors) {
  FIELDS.forEach((field) => clearFieldError(fieldElementId(field)));
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
}

export function formatMealDateTime(
  isoUtc,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  return new Date(isoUtc)
    .toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    })
    .replace(/\u202f/g, ' ');
}
