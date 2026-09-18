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

  it('renders the signed-in account email and active session count', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        email: 'jordan@example.com',
        display_name: 'Jordan',
        active_sessions: 3,
      }),
    });

    const { loadAccountSummary } = await loadAccountSettingsPage();
    await loadAccountSummary();

    expect(document.getElementById('account-email').textContent).toBe('jordan@example.com');
    expect(document.getElementById('active-sessions-count').textContent).toBe('3 devices');
  });

  it('redirects to login when not signed in', async () => {
    delete window.location;
    window.location = { href: '' };
    global.fetch.mockResolvedValue({ status: 401 });

    const { loadAccountSummary } = await loadAccountSettingsPage();
    await loadAccountSummary();

    expect(window.location.href).toBe('login.html');
  });
});
