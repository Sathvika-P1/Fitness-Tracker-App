import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/profile.html');

async function loadProfilePage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/profile.js');
}

describe('profile', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows "Not set" for fields left blank at signup', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        display_name: 'Jordan',
        units_preference: 'metric',
        fitness_goal: null,
        height_cm: null,
        weight_kg: null,
        age: null,
        gender: null,
      }),
    });

    const { loadProfile } = await loadProfilePage();
    await loadProfile();

    expect(document.querySelectorAll('.not-set').length).toBeGreaterThan(0);
    expect(document.getElementById('height-cm').value).toBe('');
    expect(document.getElementById('units-preference').value).toBe('metric');
  });

  it('populates the avatar-menu trigger with the user initials (AC15, AC16)', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        display_name: 'Jordan Diaz',
        units_preference: 'metric',
        fitness_goal: null,
        height_cm: null,
        weight_kg: null,
        age: null,
        gender: null,
      }),
    });

    const { loadProfile } = await loadProfilePage();
    await loadProfile();

    expect(document.getElementById('avatar-menu-initial').textContent).toBe('JD');
  });

  it('renders inline field errors from a rejected save without saving', async () => {
    const { renderErrors } = await loadProfilePage();

    renderErrors({ height_cm: 'Height must be between 1 and 300 cm.' });

    const errorEl = document.getElementById('height-cm-error');
    const inputEl = document.getElementById('height-cm');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toContain('Height must be between 1 and 300 cm.');
    expect(inputEl.classList.contains('has-error')).toBe(true);
  });

  it('reports session expiry on a 401 save response', async () => {
    const { saveProfile } = await loadProfilePage();
    global.fetch.mockResolvedValue({ status: 401 });

    const result = await saveProfile({ display_name: 'Jordan' });

    expect(result).toEqual({ ok: false, sessionExpired: true });
  });

  it('reports a network error when the save request throws', async () => {
    const { saveProfile } = await loadProfilePage();
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await saveProfile({ display_name: 'Jordan' });

    expect(result).toEqual({ ok: false, networkError: true });
  });

  it('shows a logout control that mirrors the dashboard avatar menu (AC7, AC16)', async () => {
    await loadProfilePage();
    expect(document.getElementById('profile-logout-btn')).not.toBeNull();
    expect(document.querySelector('.avatar-menu .avatar-menu-trigger .avatar')).not.toBeNull();
    expect(document.querySelector('.avatar-menu-dropdown .avatar-menu-item.danger')).not.toBeNull();
  });

  it('logout posts to /api/logout and redirects to the login screen on success (AC8)', async () => {
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ message: 'Signed out.', display_name: 'Jordan' }) });
    delete window.location;
    window.location = { href: '' };

    const { logout } = await loadProfilePage();
    await logout();

    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { method: 'POST', credentials: 'include' });
    expect(window.location.href).toBe('login.html?logged_out=1');
  });

  it('shows an inline error and does not redirect when logout fails (AC13, AC14)', async () => {
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ display_name: 'Jordan' }) });
    delete window.location;
    window.location = { href: '' };

    const { logout } = await loadProfilePage();
    global.fetch.mockResolvedValue({ status: 500, json: async () => ({}) });
    await logout();

    expect(document.getElementById('profile-logout-error').hidden).toBe(false);
    expect(window.location.href).toBe('');
  });

  it('shows an inline error and does not redirect when the logout request throws (AC13, AC14)', async () => {
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ display_name: 'Jordan' }) });
    delete window.location;
    window.location = { href: '' };

    const { logout } = await loadProfilePage();
    global.fetch.mockRejectedValue(new Error('network down'));
    await logout();

    expect(document.getElementById('profile-logout-error').hidden).toBe(false);
    expect(window.location.href).toBe('');
  });

  it('Today link and disabled Log/Progress tabs are unchanged (AC9, AC10)', async () => {
    await loadProfilePage();
    expect(document.querySelector('.bottom-tab[href="dashboard.html"]')).not.toBeNull();
    document.querySelectorAll('.bottom-tab[aria-disabled="true"]').forEach((tab) => {
      expect(tab.hasAttribute('href')).toBe(false);
    });
  });
});
