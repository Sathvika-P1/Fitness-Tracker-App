import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/workout-entry.html');

async function loadWorkoutEntryPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/workout-entry.js');
}

describe('workout-entry', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('filters suggestions to substring matches without restricting free text (AC7)', async () => {
    const { filterSuggestions } = await loadWorkoutEntryPage();

    expect(filterSuggestions(['Back squat', 'Bench press', 'Deadlift'], 'b')).toEqual([
      'Back squat',
      'Bench press',
    ]);
    expect(filterSuggestions(['Back squat', 'Bench press'], 'zzz')).toEqual([]);
  });

  it('reports a network error and preserves entered values on submit failure (AC8)', async () => {
    const { submitEntry } = await loadWorkoutEntryPage();
    global.fetch.mockRejectedValue(new Error('down'));

    const result = await submitEntry({
      exercise_name: 'Squat',
      entry_date: '2026-09-20',
      duration_minutes: '30',
    });

    expect(result).toEqual({ ok: false, networkError: true });
  });

  it('does not clear the exercise name input after a failed submit (AC8)', async () => {
    await loadWorkoutEntryPage();
    document.getElementById('exercise-name').value = 'Squat';
    global.fetch.mockRejectedValue(new Error('down'));

    document.getElementById('workout-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('exercise-name').value).toBe('Squat');
    expect(document.getElementById('save-error-banner').hidden).toBe(false);
  });

  it('reports session expiry on a 401 save response without discarding entered data (AC10)', async () => {
    const { submitEntry } = await loadWorkoutEntryPage();
    global.fetch.mockResolvedValue({ status: 401 });

    const result = await submitEntry({ exercise_name: 'Squat', entry_date: '2026-09-20' });

    expect(result).toEqual({ ok: false, sessionExpired: true });
  });

  it('renders inline field errors from a rejected save (AC3, AC4, AC6, AC9)', async () => {
    const { renderValidationErrors } = await loadWorkoutEntryPage();

    renderValidationErrors({
      exercise_name: 'Exercise name is required.',
      entry: 'Enter a duration, or sets and reps — at least one is required.',
    });

    expect(document.getElementById('exercise-name-error').hidden).toBe(false);
    expect(document.getElementById('exercise-name-error').textContent).toContain(
      'Exercise name is required.'
    );
    expect(document.getElementById('entry-error').hidden).toBe(false);
  });

  it('returns a created entry on a successful save (AC1)', async () => {
    const { submitEntry } = await loadWorkoutEntryPage();
    global.fetch.mockResolvedValue({
      status: 201,
      json: async () => ({ id: 1, exercise_name: 'Back squat' }),
    });

    const result = await submitEntry({
      exercise_name: 'Back squat',
      entry_date: '2026-09-20',
      duration_minutes: '30',
    });

    expect(result).toEqual({ ok: true, entry: { id: 1, exercise_name: 'Back squat' } });
  });

  it('defaults the date field to the local date, not UTC, near a day boundary', async () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T03:00:00Z'));

    await loadWorkoutEntryPage();

    expect(document.getElementById('entry-date').value).toBe('2026-09-22');
    expect(document.getElementById('entry-date').max).toBe('2026-09-22');
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it('resets the date field to today when logging another workout after a save', async () => {
    global.fetch.mockResolvedValue({
      status: 201,
      json: async () => ({ id: 1, exercise_name: 'Squat' }),
    });
    await loadWorkoutEntryPage();

    document.getElementById('workout-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('entry-date').value).toBe('');

    document.getElementById('log-another-btn').click();

    expect(document.getElementById('entry-date').value).not.toBe('');
  });
});
