import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/edit-workout.html');

async function loadEditWorkoutPage(search = '?id=1') {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  delete window.location;
  window.location = { href: '', search };
  vi.resetModules();
  return import('../public/edit-workout.js');
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('edit-workout', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('pre-fills the form with the entry\'s current values on load (AC1)', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        id: 1,
        exercise_name: 'Back squat',
        entry_date: '2026-09-20',
        duration_minutes: 30,
        sets: null,
        reps: null,
      }),
    });

    await loadEditWorkoutPage();
    await flush();

    expect(document.getElementById('exercise-name').value).toBe('Back squat');
    expect(document.getElementById('entry-date').value).toBe('2026-09-20');
    expect(document.getElementById('duration').value).toBe('30');
    expect(document.getElementById('edit-form').hidden).toBe(false);
  });

  it('submits an update and redirects to history on success (AC2, AC3)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 1,
          exercise_name: 'Back squat',
          entry_date: '2026-09-20',
          duration_minutes: 30,
          sets: null,
          reps: null,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ id: 1, exercise_name: 'Front squat' }),
      });

    await loadEditWorkoutPage();
    await flush();

    document.getElementById('exercise-name').value = 'Front squat';
    document.getElementById('edit-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();

    expect(window.location.href).toBe('history.html?updated=1');
  });

  it('redirects with the edited entry\'s own id, not a hardcoded one (AC3)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 42,
          exercise_name: 'Back squat',
          entry_date: '2026-09-20',
          duration_minutes: 30,
          sets: null,
          reps: null,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ id: 42, exercise_name: 'Front squat' }),
      });

    await loadEditWorkoutPage('?id=42');
    await flush();

    document.getElementById('edit-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();

    expect(window.location.href).toBe('history.html?updated=42');
  });

  it('URL-encodes the entry id from the query string before it goes back into the redirect (query param injection guard)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: '1&foo=bar',
          exercise_name: 'Back squat',
          entry_date: '2026-09-20',
          duration_minutes: 30,
          sets: null,
          reps: null,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ id: '1&foo=bar', exercise_name: 'Front squat' }),
      });

    await loadEditWorkoutPage('?id=1%26foo%3Dbar');
    await flush();

    document.getElementById('edit-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();

    expect(window.location.href).toBe('history.html?updated=1%26foo%3Dbar');
  });

  it('renders inline validation errors and keeps typed values on a rejected save (AC4, AC5)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 1,
          exercise_name: 'Back squat',
          entry_date: '2026-09-20',
          duration_minutes: 30,
          sets: null,
          reps: null,
        }),
      })
      .mockResolvedValueOnce({
        status: 400,
        json: async () => ({ errors: { sets: "Sets can't be negative." } }),
      });

    await loadEditWorkoutPage();
    await flush();

    document.getElementById('sets').value = '-1';
    document.getElementById('edit-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();

    expect(document.getElementById('sets-error').hidden).toBe(false);
    expect(document.getElementById('sets').value).toBe('-1');
    expect(window.location.href).toBe('');
  });

  it('shows a generic error banner and preserves unsaved edits on a network failure (AC6, AC7)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 1,
          exercise_name: 'Back squat',
          entry_date: '2026-09-20',
          duration_minutes: 30,
          sets: null,
          reps: null,
        }),
      })
      .mockRejectedValueOnce(new Error('network down'));

    await loadEditWorkoutPage();
    await flush();

    document.getElementById('exercise-name').value = 'Changed name';
    document.getElementById('edit-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();

    expect(document.getElementById('save-error-banner').hidden).toBe(false);
    expect(document.getElementById('exercise-name').value).toBe('Changed name');
  });

  it('never renders the form and shows a refusal banner for a non-owned entry (AC8)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 403,
      json: async () => ({ message: "You can only edit workouts you've logged yourself." }),
    });

    await loadEditWorkoutPage();
    await flush();

    expect(document.getElementById('edit-form').hidden).toBe(true);
    expect(document.getElementById('load-error-banner').hidden).toBe(false);
    expect(document.getElementById('load-error-body').textContent).toContain(
      "You can only edit workouts you've logged yourself."
    );
  });

  it('redirects to history with a deleted flag when the load finds the entry gone (AC13, AC14)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({ message: 'This workout no longer exists.' }),
    });

    await loadEditWorkoutPage();
    await flush();

    expect(window.location.href).toBe('history.html?deleted=1');
  });

  it('redirects to history with a deleted flag when a save finds the entry gone (AC13, AC14)', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 1,
          exercise_name: 'Back squat',
          entry_date: '2026-09-20',
          duration_minutes: 30,
          sets: null,
          reps: null,
        }),
      })
      .mockResolvedValueOnce({
        status: 404,
        json: async () => ({ message: 'This workout no longer exists.' }),
      });

    await loadEditWorkoutPage();
    await flush();

    document.getElementById('edit-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();

    expect(window.location.href).toBe('history.html?deleted=1');
  });
});
