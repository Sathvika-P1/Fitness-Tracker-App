import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/login.html');
const signupHtmlPath = path.resolve(__dirname, '../public/signup.html');

async function loadLoginPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/login.js');
}

describe('login page', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows the generic banner, never a per-field error, on invalid credentials', async () => {
    const { submitLoginForm } = await loadLoginPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({ message: 'Invalid email or password.' }),
    });
    await submitLoginForm({ email: 'x@example.com', password: 'bad' });
    expect(document.getElementById('error-banner').hidden).toBe(false);
    expect(document.querySelector('.field-error-text')).toBeNull();
  });

  it('same generic banner repeats on consecutive invalid attempts (no lockout)', async () => {
    const { submitLoginForm } = await loadLoginPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({ message: 'Invalid email or password.' }),
    });
    for (let i = 0; i < 3; i++) {
      await submitLoginForm({ email: 'x@example.com', password: 'bad' });
      expect(document.getElementById('error-banner').hidden).toBe(false);
    }
  });

  it('redirects to dashboard.html on a 200 response', async () => {
    const { submitLoginForm } = await loadLoginPage();
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ email: 'a@b.com', display_name: 'A' }),
    });
    delete window.location;
    window.location = { href: '' };
    await submitLoginForm({ email: 'a@b.com', password: 'REDACTED_EXAMPLE_PW' });
    expect(window.location.href).toBe('dashboard.html');
  });

  it('redirects to dashboard immediately when an active session is found', async () => {
    const { checkExistingSession } = await loadLoginPage();
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ email: 'a@b.com', display_name: 'A' }),
    });
    delete window.location;
    window.location = { href: '' };
    await checkExistingSession();
    expect(window.location.href).toBe('dashboard.html');
  });

  it('leaves the login form visible when no session is found', async () => {
    const { checkExistingSession } = await loadLoginPage();
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({ message: 'Not signed in.' }) });
    delete window.location;
    window.location = { href: '' };
    await checkExistingSession();
    expect(window.location.href).toBe('');
  });

  it('keeps the form hidden until an active session is confirmed absent (AC8)', async () => {
    document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
    expect(document.getElementById('login-form').hidden).toBe(true);
  });

  it('reveals the login form once /api/me confirms no active session', async () => {
    const { checkExistingSession } = await loadLoginPage();
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({ message: 'Not signed in.' }) });
    await checkExistingSession();
    expect(document.getElementById('login-form').hidden).toBe(false);
  });

  it('shows the logged-out banner when arriving via ?logged_out=1 with no active session', async () => {
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({ message: 'Not signed in.' }) });
    delete window.location;
    window.location = { href: '', search: '?logged_out=1' };
    const { checkExistingSession } = await loadLoginPage();
    await checkExistingSession();
    expect(document.getElementById('logged-out-banner').hidden).toBe(false);
  });

  it('does not show the logged-out banner without the query param', async () => {
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({ message: 'Not signed in.' }) });
    delete window.location;
    window.location = { href: '', search: '' };
    const { checkExistingSession } = await loadLoginPage();
    await checkExistingSession();
    expect(document.getElementById('logged-out-banner').hidden).toBe(true);
  });

  it('marks both fields with has-error on invalid credentials', async () => {
    const { submitLoginForm } = await loadLoginPage();
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({ message: 'Invalid email or password.' }),
    });
    await submitLoginForm({ email: 'x@example.com', password: 'bad' });
    expect(document.getElementById('email').classList.contains('has-error')).toBe(true);
    expect(document.getElementById('password').classList.contains('has-error')).toBe(true);
  });

  it('submitting the form triggers the login request', async () => {
    global.fetch.mockResolvedValue({
      status: 401,
      json: async () => ({ message: 'Invalid email or password.' }),
    });
    const { checkExistingSession } = await loadLoginPage();
    await checkExistingSession();
    document.getElementById('email').value = 'a@b.com';
    document.getElementById('password').value = 'bad';
    document.getElementById('login-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST' }));
  });

  it('never reveals the form when a session is found — it redirects instead', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({ email: 'a@b.com', display_name: 'A' }),
    });
    delete window.location;
    window.location = { href: '' };
    const { checkExistingSession } = await loadLoginPage();
    await checkExistingSession();
    expect(document.getElementById('login-form').hidden).toBe(true);
  });
});

describe('signup page sign-in link', () => {
  it('navigates to login.html', () => {
    document.documentElement.innerHTML = readFileSync(signupHtmlPath, 'utf-8');
    const link = document.querySelector('.center-note .link-inline');
    expect(link.getAttribute('onclick')).toContain('login.html');
  });
});
