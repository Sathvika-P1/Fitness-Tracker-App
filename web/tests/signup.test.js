import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const htmlPath = path.resolve(__dirname, '../public/signup.html');

async function loadSignupPage() {
  document.documentElement.innerHTML = readFileSync(htmlPath, 'utf-8');
  vi.resetModules();
  return import('../public/signup.js');
}

describe('signup form validation', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders each omitted-field error inline next to its own field', async () => {
    const { submitSignupForm } = await loadSignupPage();

    await submitSignupForm({ email: '', password: 'test-password', displayName: 'X' });

    expect(document.getElementById('email-error').textContent).toContain(
      'Enter an email to continue.'
    );
    expect(document.getElementById('email').classList.contains('has-error')).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows the duplicate-email banner on a 409 response', async () => {
    const { submitSignupForm } = await loadSignupPage();
    global.fetch.mockResolvedValue({
      status: 409,
      json: async () => ({ field: 'email', message: 'This email is taken.' }),
    });

    await submitSignupForm({
      email: 'jane.doe@example.com',
      password: 'test-password',
      displayName: 'Jane D.',
    });

    expect(document.getElementById('duplicate-banner').hidden).toBe(false);
    expect(document.getElementById('email-error').textContent).toContain(
      'This email is taken.'
    );
  });
});
