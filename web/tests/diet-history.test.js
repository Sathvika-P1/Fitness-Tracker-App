import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMealDateTime } from '../public/meal-form.js';

const htmlPath = path.resolve(__dirname, '../public/diet-history.html');

async function loadDietHistoryPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  delete window.location;
  window.location = { href: '' };
  vi.resetModules();
  return import('../public/diet-history.js');
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mealFixture = {
  id: 1,
  calories: 650,
  carbs_g: 80,
  protein_g: 35,
  fat_g: 20,
  eaten_at_utc: '2026-09-30T16:30:00.000Z',
};

describe('diet-history', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders no edit or delete control for any entry (AC13)', async () => {
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [mealFixture] }) });
    await loadDietHistoryPage();
    await flush();

    expect(document.querySelector('a[href*="edit"]')).toBeNull();
    expect(document.querySelector('.history-delete-btn')).toBeNull();
    expect(document.getElementById('no-actions-note').hidden).toBe(false);
  });

  it('lists meal entries scoped to the account response (AC2)', async () => {
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [mealFixture] }) });
    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('entry-count').textContent).toContain('1');
    expect(document.querySelectorAll('.history-row').length).toBe(1);
  });

  it('shows the empty state when there are no entries', async () => {
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [] }) });
    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('empty-state').hidden).toBe(false);
  });
});

describe('formatMealDateTime', () => {
  it('formats a UTC instant into the given local timezone (AC14)', () => {
    expect(formatMealDateTime('2026-09-30T16:30:00.000Z', 'America/New_York')).toBe(
      'Sep 30, 2026, 12:30 PM'
    );
  });
});
