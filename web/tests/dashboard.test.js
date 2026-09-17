import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/dashboard.html');

async function loadDashboardPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/dashboard.js');
}

describe('dashboard', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders the signed-in account display name and email from /api/me', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ email: 'jane.doe@example.com', display_name: 'Jane D.' }),
    });

    const { loadDashboard } = await loadDashboardPage();
    await loadDashboard();

    expect(document.getElementById('welcome-name').textContent).toBe('Welcome, Jane D.');
    expect(document.getElementById('welcome-email').textContent).toBe('jane.doe@example.com');
  });

  function mockMeAndLogout() {
    global.fetch.mockImplementation((url) =>
      Promise.resolve(
        url === '/api/me'
          ? { status: 200, json: async () => ({ email: 'jane.doe@example.com', display_name: 'Jane D.' }) }
          : { status: 200, json: async () => ({ message: 'Signed out.' }) }
      )
    );
  }

  it('logout posts to /api/logout and redirects to the login screen', async () => {
    mockMeAndLogout();
    const { logout } = await loadDashboardPage();

    delete window.location;
    window.location = { href: '' };

    await logout();

    expect(global.fetch).toHaveBeenCalledWith('/api/logout', {
      method: 'POST',
      credentials: 'include',
    });
    expect(window.location.href).toBe('login.html?logged_out=1');
  });

  it('clicking the logout button triggers the same logout flow', async () => {
    mockMeAndLogout();
    await loadDashboardPage();

    delete window.location;
    window.location = { href: '' };

    document.getElementById('logout-button').dispatchEvent(new window.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).toHaveBeenCalledWith('/api/logout', {
      method: 'POST',
      credentials: 'include',
    });
    expect(window.location.href).toBe('login.html?logged_out=1');
  });
});
