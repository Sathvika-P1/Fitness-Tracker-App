import { logout as sharedLogout, submitEntry as sharedSubmitEntry } from './session-utils.js';
import { todayIsoDate } from './workout-form.js';
import {
  collectFormValues,
  renderValidationErrors,
  clearValidationErrors,
  formatMealDateTime,
} from './meal-form.js';

export { collectFormValues, renderValidationErrors, clearValidationErrors };

export function submitEntry(values) {
  return sharedSubmitEntry('/api/meals', values, 'meal_save_failed');
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
      confirmBox.querySelector('h2')?.focus();
    } else if (result.sessionExpired) {
      sessionExpiredBanner.hidden = false;
      saveButton.textContent = 'Save meal →';
    } else if (result.networkError) {
      saveErrorBanner.hidden = false;
      saveButton.textContent = 'Retry save →';
    } else {
      renderValidationErrors(result.errors);
      saveButton.textContent = 'Save meal →';
      document.querySelector('[aria-invalid="true"]')?.focus();
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
  document.getElementById('cal')?.focus();
});

export function logout() {
  return sharedLogout('meal-logout-error');
}

document.getElementById('meal-logout-btn')?.addEventListener('click', logout);

initializeDate();
