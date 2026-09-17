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
});
