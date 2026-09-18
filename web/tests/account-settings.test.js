import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/account-settings.html');

async function loadAccountSettingsPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/account-settings.js');
}

describe('account-settings', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('keeps the delete button disabled until password and checkbox are both set', async () => {
    const { updateDeleteButton } = await loadAccountSettingsPage();
    document.getElementById('confirm-password').value = 'test-password';
    document.getElementById('confirm-checkbox').checked = false;
    updateDeleteButton();
    expect(document.getElementById('delete-submit-btn').disabled).toBe(true);

    document.getElementById('confirm-checkbox').checked = true;
    updateDeleteButton();
    expect(document.getElementById('delete-submit-btn').disabled).toBe(false);
  });

  it('reports an already-deleted result on a 200 idempotent duplicate response', async () => {
    const { submitDeletion } = await loadAccountSettingsPage();
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ status: 'already_deleted' }),
    });

    const result = await submitDeletion('test-password');

    expect(result).toEqual({ ok: false, alreadyDeleted: true });
  });

  it('reports a locked-out result on a 429 response', async () => {
    const { submitDeletion } = await loadAccountSettingsPage();
    global.fetch.mockResolvedValue({
      status: 429,
      json: async () => ({ message: 'Too many incorrect attempts. Try again in 15 minutes.' }),
    });

    const result = await submitDeletion('test-password');

    expect(result).toEqual({ ok: false, lockedOut: true });
  });

  it('reports incorrect password on a 401 response', async () => {
    const { submitDeletion } = await loadAccountSettingsPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({ message: 'Incorrect password. Your account has not been changed.' }),
    });

    const result = await submitDeletion('wrong');

    expect(result).toEqual({ ok: false, incorrectPassword: true });
  });

  it('reports success with the revoked session count on a 200 response', async () => {
    const { submitDeletion } = await loadAccountSettingsPage();
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ message: 'Account deleted.', sessions_revoked: 3 }),
    });

    const result = await submitDeletion('test-password');

    expect(result).toEqual({ ok: true, sessionsRevoked: 3 });
  });
});
