import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/index.html');

async function loadWelcomePage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/index.js');
}

describe('welcome page', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('exists as a static file so / serves it instead of a directory listing (AC1)', () => {
    expect(existsSync(htmlPath)).toBe(true);
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('welcome-shell');
  });

  it('redirects to dashboard.html when a session exists (AC2)', async () => {
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ email: 'a@b.com', display_name: 'A' }) });
    delete window.location;
    window.location = { href: '' };

    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();

    expect(window.location.href).toBe('dashboard.html');
  });

  it("shows the app name and intro paragraph when there is no session (AC3, AC15)", async () => {
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({}) });

    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();

    expect(document.getElementById('welcome-checking').hidden).toBe(true);
    expect(document.querySelector('.welcome-card h1').textContent).toBe('Fitness Tracker');
    expect(document.querySelector('.welcome-card p.text-muted').textContent).toMatch(/log workouts/);
  });

  it('renders "Log in" and "Sign up" as two side-by-side options (AC4)', async () => {
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({}) });

    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();

    expect(document.querySelectorAll('.welcome-options > a.btn').length).toBe(2);
  });

  it('"Log in" navigates to login.html (AC5)', async () => {
    document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
    expect(document.getElementById('welcome-login-btn').getAttribute('href')).toBe('login.html');
  });

  it('"Sign up" navigates to signup.html (AC6)', async () => {
    document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
    expect(document.getElementById('welcome-signup-btn').getAttribute('href')).toBe('signup.html');
  });

  it('treats a network error from /api/me as no session (AC12)', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    delete window.location;
    window.location = { href: '' };

    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();

    expect(document.querySelector('.welcome-card')).not.toBeNull();
    expect(document.getElementById('welcome-checking').hidden).toBe(true);
    expect(window.location.href).toBe('');
  });
});
