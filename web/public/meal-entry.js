import { logout as sharedLogout } from './session-utils.js';
import { todayIsoDate } from './workout-form.js';
import {
  collectFormValues,
  renderValidationErrors,
  clearValidationErrors,
  formatMealDateTime,
} from './meal-form.js';

export { collectFormValues, renderValidationErrors, clearValidationErrors };

export async function submitEntry(values) {
  let res;
  try {
    res = await fetch('/api/meals', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
  } catch (error) {
    console.error('meal_save_failed', { error });
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

const form = document.getElementById('meal-form');
const saveButton = document.getElementById('save-button');
const saveErrorBanner = document.getElementById('save-error-banner');
const sessionExpiredBanner = document.getElementById('session-expired-banner');
const confirmBox = document.getElementById('confirm-box');
const confirmSummary = document.getElementById('confirm-summary');
const logAnotherBtn = document.getElementById('log-another-btn');

function summaryRow(label, value) {
  const li = document.createElement('li');
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  li.appendChild(labelEl);
  li.appendChild(valueEl);
  return li;
}

function renderConfirmSummary(entry) {
  confirmSummary.innerHTML = '';
  confirmSummary.appendChild(summaryRow('Calories', `${entry.calories} kcal`));
  confirmSummary.appendChild(summaryRow('Carbs', `${entry.carbs_g} g`));
  confirmSummary.appendChild(summaryRow('Protein', `${entry.protein_g} g`));
  confirmSummary.appendChild(summaryRow('Fat', `${entry.fat_g} g`));
  confirmSummary.appendChild(
    summaryRow('Logged', formatMealDateTime(entry.eaten_at_utc))
  );
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearValidationErrors();
  saveErrorBanner.hidden = true;
  sessionExpiredBanner.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';
  try {
    const values = collectFormValues();
    const result = await submitEntry(values);
    if (result.ok) {
      form.hidden = true;
      confirmBox.hidden = false;
      renderConfirmSummary(result.entry);
      form.reset();
      saveButton.textContent = 'Save meal →';
    } else if (result.sessionExpired) {
      sessionExpiredBanner.hidden = false;
      saveButton.textContent = 'Save meal →';
    } else if (result.networkError) {
      saveErrorBanner.hidden = false;
      saveButton.textContent = 'Retry save →';
    } else {
      renderValidationErrors(result.errors);
      saveButton.textContent = 'Save meal →';
    }
  } finally {
    saveButton.disabled = false;
  }
});

function initializeDate() {
  const dateInput = document.getElementById('meal-date');
  if (!dateInput) return;
  const today = todayIsoDate();
  dateInput.value = today;
  dateInput.max = today;
}

logAnotherBtn?.addEventListener('click', () => {
  confirmBox.hidden = true;
  form.hidden = false;
  saveButton.textContent = 'Save meal →';
  initializeDate();
});

export function logout() {
  return sharedLogout('meal-logout-error');
}

document.getElementById('meal-logout-btn')?.addEventListener('click', logout);

initializeDate();
