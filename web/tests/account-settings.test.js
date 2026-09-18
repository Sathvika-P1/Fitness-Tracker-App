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

  it('shows a logout control that mirrors the dashboard avatar menu (AC7, AC16)', async () => {
    await loadAccountSettingsPage();
    expect(document.getElementById('settings-logout-btn')).not.toBeNull();
    expect(document.querySelector('.avatar-menu .avatar-menu-trigger .avatar')).not.toBeNull();
    expect(document.querySelector('.avatar-menu-dropdown .avatar-menu-item.danger')).not.toBeNull();
  });

  it('logout posts to /api/logout and redirects to the login screen on success (AC8)', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ message: 'Signed out.', email: 'jordan@example.com', active_sessions: 1 }),
    });
    delete window.location;
    window.location = { href: '' };

    const { logout } = await loadAccountSettingsPage();
    await logout();

    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { method: 'POST', credentials: 'include' });
    expect(window.location.href).toBe('login.html?logged_out=1');
  });

  it('shows an inline error and does not redirect when logout fails (AC13, AC14)', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ email: 'jordan@example.com', active_sessions: 1 }),
    });
    delete window.location;
    window.location = { href: '' };

    const { logout } = await loadAccountSettingsPage();
    global.fetch.mockResolvedValue({ status: 500, json: async () => ({}) });
    await logout();

    expect(document.getElementById('settings-logout-error').hidden).toBe(false);
    expect(window.location.href).toBe('');
  });

  it('disabled Log/Progress tabs and the Profile tab are unchanged (AC9, AC10)', async () => {
    await loadAccountSettingsPage();
    expect(document.querySelector('a.bottom-tab.active[href="profile.html"]')).not.toBeNull();
    document.querySelectorAll('.bottom-tab[aria-disabled="true"]').forEach((tab) => {
      expect(tab.hasAttribute('href')).toBe(false);
    });
  });
});
