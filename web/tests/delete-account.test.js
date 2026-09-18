import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/delete-account.html');

async function loadDeleteAccountPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/delete-account.js');
}

describe('delete-account', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('keeps the delete button disabled until password and checkbox are both filled', async () => {
    const { updateDeleteButton } = await loadDeleteAccountPage();

    document.getElementById('confirm-password').value = 'test-password';
    document.getElementById('confirm-checkbox').checked = false;
    updateDeleteButton();
    expect(document.getElementById('delete-submit-btn').disabled).toBe(true);

    document.getElementById('confirm-checkbox').checked = true;
    updateDeleteButton();
    expect(document.getElementById('delete-submit-btn').disabled).toBe(false);
  });

  it('shows the incorrect-password error and remaining attempts on a 401 response', async () => {
    const { submitDeletion } = await loadDeleteAccountPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({
        message: 'Incorrect password. Your account has not been changed.',
        reason: 'incorrect_password',
        remaining_attempts: 4,
      }),
    });

    await submitDeletion('wrong-password');

    expect(document.getElementById('password-error').hidden).toBe(false);
    expect(document.getElementById('confirm-view').hidden).toBe(false);
    expect(document.getElementById('attempt-counter').hidden).toBe(false);
    expect(document.getElementById('attempt-counter').textContent).toContain(
      'remaining before lockout'
    );
    expect(document.getElementById('deleting-view').hidden).toBe(true);
  });

  it('shows the lockout banner on a 423 response', async () => {
    const { submitDeletion } = await loadDeleteAccountPage();
    global.fetch.mockResolvedValue({
      status: 423,
      json: async () => ({
        message: 'Too many incorrect attempts. Try again later.',
        reason: 'locked_out',
        remaining_attempts: 0,
      }),
    });

    await submitDeletion('test-password');

    expect(document.getElementById('lockout-banner').hidden).toBe(false);
    expect(document.getElementById('delete-submit-btn').disabled).toBe(true);
  });

  it('shows the deletion-complete view on a 200 response', async () => {
    const { submitDeletion } = await loadDeleteAccountPage();
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ message: 'Account deleted.' }) });

    await submitDeletion('test-password');

    expect(document.getElementById('complete-view').hidden).toBe(false);
    expect(document.getElementById('confirm-view').hidden).toBe(true);
  });

  it('shows the already-deleted view on a 401 "not_signed_in" response', async () => {
    const { submitDeletion } = await loadDeleteAccountPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({ message: 'Not signed in.', reason: 'not_signed_in' }),
    });

    await submitDeletion('test-password');

    expect(document.getElementById('already-deleted-view').hidden).toBe(false);
  });

  it('falls back to the confirm view without claiming an incorrect password when the error body is unparsable', async () => {
    const { submitDeletion } = await loadDeleteAccountPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => {
        throw new Error('bad body');
      },
    });

    await submitDeletion('test-password');

    expect(document.getElementById('confirm-view').hidden).toBe(false);
    expect(document.getElementById('password-error').hidden).toBe(true);
    expect(document.getElementById('deleting-view').hidden).toBe(true);
  });

  it('redirects an unauthenticated visitor to login instead of showing the confirm view', async () => {
    delete window.location;
    window.location = { href: '' };
    global.fetch.mockResolvedValue({ status: 401 });

    const { requireSignedIn } = await loadDeleteAccountPage();
    await requireSignedIn();

    expect(window.location.href).toBe('login.html');
  });
});
