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

  it('renders the signed-in account email', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ email: 'jordan@example.com', display_name: 'Jordan' }),
    });

    const { loadAccountSummary } = await loadAccountSettingsPage();
    await loadAccountSummary();

    expect(document.getElementById('account-email').textContent).toBe('jordan@example.com');
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
