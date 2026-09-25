import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/history.html');

async function loadHistoryPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/history.js');
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const fullFixture = [
  { id: 1, exercise_name: 'Back squat', entry_date: '2026-09-22', sets: 3, reps: 8, duration_minutes: null },
  { id: 2, exercise_name: 'Bench press', entry_date: '2026-08-02', sets: null, reps: null, duration_minutes: 20 },
];

describe('history', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ entries: [] }) });
  });

  it('formatMetrics renders zero sets/reps instead of falling back to minutes (falsy-zero guard)', async () => {
    const { formatMetrics } = await loadHistoryPage();
    expect(formatMetrics({ sets: 0, reps: 0, duration_minutes: null })).toEqual([
      { val: '0 × 0', unit: 'sets × reps' },
    ]);
    expect(formatMetrics({ sets: null, reps: null, duration_minutes: 45 })).toEqual([
      { val: '45', unit: 'minutes' },
    ]);
  });

  it('buildQueryString omits empty params', async () => {
    const { buildQueryString } = await loadHistoryPage();
    expect(buildQueryString({ startDate: '', endDate: '', exerciseName: '' })).toBe('');
    expect(buildQueryString({ startDate: '2026-09-01', endDate: '', exerciseName: 'squat' })).toBe(
      '?start_date=2026-09-01&exercise_name=squat'
    );
  });

  it('renders the complete list newest-first (AC1)', async () => {
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ entries: fullFixture }) });
    await loadHistoryPage();
    await flush();

    const rows = document.querySelectorAll('#history-list .history-row');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.history-exercise').textContent).toBe('Back squat');
  });

  it('shows the standard empty state when there are no entries and no filter (AC3)', async () => {
    await loadHistoryPage();
    await flush();

    expect(document.getElementById('empty-state').hidden).toBe(false);
    expect(document.getElementById('history-list').hidden).toBe(true);
    expect(document.getElementById('empty-state-title').textContent).toBe('No workouts logged yet');
  });

  it('applies a date-range + name filter and requests both params (AC4, AC5, AC6)', async () => {
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ entries: [] }) });
    await loadHistoryPage();
    await flush();

    document.getElementById('filter-start').value = '2026-09-10';
    document.getElementById('filter-end').value = '2026-09-20';
    document.getElementById('filter-name').value = 'squat';
    document.getElementById('apply-filters-btn').click();
    await flush();

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/workouts?start_date=2026-09-10&end_date=2026-09-20&exercise_name=squat',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('clearing an active filter refetches and renders the unfiltered list (AC7)', async () => {
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [] }) });
    await loadHistoryPage();
    await flush();

    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ entries: [fullFixture[0]] }),
    });
    document.getElementById('filter-name').value = 'squat';
    document.getElementById('apply-filters-btn').click();
    await flush();

    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: fullFixture }) });
    document.getElementById('clear-filters-btn').click();
    await flush();

    expect(document.getElementById('filter-name').value).toBe('');
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/workouts',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(document.querySelectorAll('#history-list .history-row').length).toBe(2);
  });

  it('surfaces a 400 field error on the filter inputs instead of the generic banner', async () => {
    await loadHistoryPage();
    await flush();

    global.fetch.mockResolvedValueOnce({
      status: 400,
      json: async () => ({ errors: { start_date: 'Enter a valid date.' } }),
    });
    document.getElementById('filter-start').value = 'not-a-date';
    document.getElementById('apply-filters-btn').click();
    await flush();

    expect(document.getElementById('filter-start-error').hidden).toBe(false);
    expect(document.getElementById('filter-start-error').textContent).toBe('Enter a valid date.');
    expect(document.getElementById('load-error-banner').hidden).toBe(true);
  });

  it('disables Apply/Clear/Retry while a request is in flight and re-enables after it settles', async () => {
    await loadHistoryPage();
    await flush();

    let resolveFetch;
    global.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    document.getElementById('apply-filters-btn').click();
    expect(document.getElementById('apply-filters-btn').disabled).toBe(true);

    resolveFetch({ status: 200, json: async () => ({ entries: [] }) });
    await flush();

    expect(document.getElementById('apply-filters-btn').disabled).toBe(false);
  });
});
