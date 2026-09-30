import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/meal-entry.html');

async function loadMealEntryPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  delete window.location;
  window.location = { href: '' };
  vi.resetModules();
  return import('../public/meal-entry.js');
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fillValidForm() {
  document.getElementById('cal').value = '650';
  document.getElementById('carbs').value = '80';
  document.getElementById('protein').value = '35';
  document.getElementById('fat').value = '20';
  document.getElementById('meal-date').value = '2026-09-20';
  document.getElementById('meal-time').value = '12:30';
}

describe('meal-entry', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('submits a valid entry and shows the confirmation summary (AC1)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        id: 1,
        calories: 650,
        carbs_g: 80,
        protein_g: 35,
        fat_g: 20,
        eaten_at_utc: '2026-09-20T16:30:00Z',
      }),
    });
    await loadMealEntryPage();
    fillValidForm();
    document.getElementById('meal-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(document.getElementById('confirm-box').hidden).toBe(false);
    expect(document.getElementById('meal-form').hidden).toBe(true);
    expect(document.getElementById('confirm-summary').textContent).toContain('650');
    expect(document.getElementById('confirm-summary').textContent).toContain(
      new Date('2026-09-20T16:30:00Z').toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    );
    expect(document.getElementById('confirm-summary').textContent).not.toContain(
      '2026-09-20 12:30'
    );
  });

  it('shows a generic error banner and preserves entered values on a network failure (AC9)', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    await loadMealEntryPage();
    fillValidForm();
    document.getElementById('meal-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(document.getElementById('save-error-banner').hidden).toBe(false);
    expect(document.getElementById('cal').value).toBe('650');
    expect(document.getElementById('save-button').textContent).toBe('Retry save →');
  });

  it('renders per-field validation errors and keeps entered values (AC10, AC4, AC12)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 400,
      json: async () => ({
        errors: {
          calories: "Calories can't be negative.",
          time: 'Time is required.',
        },
      }),
    });
    await loadMealEntryPage();
    fillValidForm();
    document.getElementById('cal').value = '-5';
    document.getElementById('meal-time').value = '';
    document.getElementById('meal-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(document.getElementById('cal-error').hidden).toBe(false);
    expect(document.getElementById('cal-error').textContent).toContain("can't be negative");
    expect(document.getElementById('meal-time-error').hidden).toBe(false);
    expect(document.getElementById('cal').value).toBe('-5');
  });

  it('renders a combined future date/time error on both inputs (AC6)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 400,
      json: async () => ({
        errors: {
          date: 'This meal is in the future.',
          time: 'This meal is in the future.',
        },
      }),
    });
    await loadMealEntryPage();
    fillValidForm();
    document.getElementById('meal-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(document.getElementById('meal-date').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('meal-time').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('meal-date-error').hidden).toBe(false);
    expect(document.getElementById('meal-date-error').textContent).toContain(
      'This meal is in the future.'
    );
    expect(document.getElementById('meal-time-error').hidden).toBe(false);
  });

  it('submits mismatched macros without any client-side blocking error (AC8)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        id: 2,
        calories: 650,
        carbs_g: 200,
        protein_g: 150,
        fat_g: 100,
        eaten_at_utc: '2026-09-20T17:00:00Z',
      }),
    });
    await loadMealEntryPage();
    fillValidForm();
    document.getElementById('carbs').value = '200';
    document.getElementById('protein').value = '150';
    document.getElementById('fat').value = '100';
    document.getElementById('meal-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(document.getElementById('confirm-box').hidden).toBe(false);
  });
});
