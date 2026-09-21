import { beforeEach, describe, expect, it, vi } from 'vitest';

function renderMenu() {
  document.body.innerHTML = `
    <div class="avatar-menu" data-avatar-menu>
      <button class="avatar-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" data-avatar-trigger>
        <div class="avatar" aria-hidden="true"></div>
      </button>
      <div class="avatar-menu-dropdown" role="menu" hidden data-avatar-dropdown>
        <a class="avatar-menu-item" role="menuitem" href="profile.html">View profile</a>
        <button class="avatar-menu-item danger" role="menuitem" type="button">Logout</button>
      </div>
    </div>
    <div id="outside">outside</div>
  `;
}

describe('avatar-menu', () => {
  beforeEach(() => {
    vi.resetModules();
    renderMenu();
  });

  it('opens the dropdown on trigger click and closes it on a second click', async () => {
    await import('../public/avatar-menu.js');

    const trigger = document.querySelector('[data-avatar-trigger]');
    const dropdown = document.querySelector('[data-avatar-dropdown]');

    trigger.click();
    expect(dropdown.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.click();
    expect(dropdown.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the dropdown when clicking outside the menu', async () => {
    await import('../public/avatar-menu.js');

    const trigger = document.querySelector('[data-avatar-trigger]');
    const dropdown = document.querySelector('[data-avatar-dropdown]');

    trigger.click();
    expect(dropdown.hidden).toBe(false);

    document.getElementById('outside').click();
    expect(dropdown.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the dropdown and returns focus to the trigger on Escape', async () => {
    await import('../public/avatar-menu.js');

    const menu = document.querySelector('[data-avatar-menu]');
    const trigger = document.querySelector('[data-avatar-trigger]');
    const dropdown = document.querySelector('[data-avatar-dropdown]');

    trigger.click();
    expect(dropdown.hidden).toBe(false);

    menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dropdown.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});
