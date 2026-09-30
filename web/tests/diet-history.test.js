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

  it('renders no edit or delete control for any entry (AC5)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ entries: [mealFixture], has_more: false, total_count: 1 }),
    });
    await loadDietHistoryPage();
    await flush();

    expect(document.querySelector('a[href*="edit"]')).toBeNull();
    expect(document.querySelector('.history-delete-btn')).toBeNull();
    expect(document.getElementById('no-actions-note').hidden).toBe(false);
  });

  it('lists meal entries with all captured fields and no totals (AC2, AC12)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ entries: [mealFixture], has_more: false, total_count: 1 }),
    });
    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('entry-count').textContent).toBe('Showing 1–1 of 1 meals');
    expect(document.querySelectorAll('.history-row').length).toBe(1);
    expect(document.querySelectorAll('.history-metric').length).toBe(4);
    expect(document.body.textContent).not.toMatch(/\btotal\b/i);
  });

  it('shows the empty state with a call-to-action when there are no entries (AC6, AC7)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ entries: [], has_more: false, total_count: 0 }),
    });
    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('empty-state').hidden).toBe(false);
    expect(
      document.querySelector('#empty-state a.btn-primary[href="meal-entry.html"]')
    ).not.toBeNull();
  });

  it('discretely paginates, fetching page 2 in newest-first continuation (AC3, AC4, AC11)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: Array(25).fill(mealFixture), has_more: true, total_count: 26 }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: [mealFixture], has_more: false, total_count: 26 }),
      });

    await loadDietHistoryPage();
    await flush();

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('offset=0'), expect.anything());
    document.getElementById('next-page-btn').click();
    await flush();

    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('offset=25'), expect.anything());
    expect(document.getElementById('page-status').textContent).toBe('Page 2 of 2');
    expect(document.getElementById('next-page-btn').disabled).toBe(true);
  });

  it('shows all 25 entries on a single page with no second page (AC10)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ entries: Array(25).fill(mealFixture), has_more: false, total_count: 25 }),
    });
    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('page-status').textContent).toBe('Page 1 of 1');
    expect(document.getElementById('next-page-btn').disabled).toBe(true);
    expect(document.getElementById('prev-page-btn').disabled).toBe(true);
  });

  it('shows a generic error on initial load failure and retries on request (AC8, AC9)', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: [mealFixture], has_more: false, total_count: 1 }),
      });

    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('load-error-banner').hidden).toBe(false);
    expect(document.getElementById('load-error-title').textContent).toBe(
      "Couldn't load your meal history"
    );
    expect(document.getElementById('back-to-first-btn').hidden).toBe(true);
    document.getElementById('retry-btn').click();
    await flush();

    expect(document.getElementById('load-error-banner').hidden).toBe(true);
    expect(document.querySelectorAll('.history-row').length).toBe(1);
  });

  it('shows a generic error when the device is offline (AC8)', async () => {
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await loadDietHistoryPage();
    await flush();

    expect(document.getElementById('load-error-banner').hidden).toBe(false);
  });

  it('retries a failed page turn at the same offset, not page 1 (AC9)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: Array(25).fill(mealFixture), has_more: true, total_count: 26 }),
      })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: [mealFixture], has_more: false, total_count: 26 }),
      });

    await loadDietHistoryPage();
    await flush();
    document.getElementById('next-page-btn').click();
    await flush();

    expect(document.getElementById('load-error-banner').hidden).toBe(false);
    expect(document.getElementById('load-error-title').textContent).toBe(
      "Couldn't load the next page"
    );
    expect(document.getElementById('back-to-first-btn').hidden).toBe(false);
    expect(document.querySelectorAll('.history-row').length).toBe(0);

    document.getElementById('retry-btn').click();
    await flush();

    expect(fetch.mock.calls[2][0]).toContain('offset=25');
    expect(document.getElementById('load-error-banner').hidden).toBe(true);
    expect(document.getElementById('page-status').textContent).toBe('Page 2 of 2');
  });

  it('back to page 1 re-requests offset=0 after a failed page turn', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: Array(25).fill(mealFixture), has_more: true, total_count: 26 }),
      })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ entries: Array(25).fill(mealFixture), has_more: true, total_count: 26 }),
      });

    await loadDietHistoryPage();
    await flush();
    document.getElementById('next-page-btn').click();
    await flush();

    document.getElementById('back-to-first-btn').click();
    await flush();

    expect(fetch.mock.calls[2][0]).toContain('offset=0');
    expect(document.getElementById('load-error-banner').hidden).toBe(true);
    expect(document.getElementById('page-status').textContent).toBe('Page 1 of 2');
  });

  it('does not refetch or refresh an already-open list (AC13)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ entries: [mealFixture], has_more: false, total_count: 1 }),
    });
    await loadDietHistoryPage();
    await flush();

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('storage'));
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('formatMealDateTime', () => {
  it('formats a UTC instant into the given local timezone', () => {
    expect(formatMealDateTime('2026-09-30T16:30:00.000Z', 'America/New_York')).toBe(
      'Sep 30, 2026, 12:30 PM'
    );
  });
});
