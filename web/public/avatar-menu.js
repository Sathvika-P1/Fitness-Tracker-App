export function initAvatarMenus() {
  document.querySelectorAll('[data-avatar-menu]').forEach((menu) => {
    const trigger = menu.querySelector('[data-avatar-trigger]');
    const dropdown = menu.querySelector('[data-avatar-dropdown]');
    if (!trigger || !dropdown) return;
    trigger.addEventListener('click', () => {
      const isOpen = !dropdown.hidden;
      dropdown.hidden = isOpen;
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) {
        dropdown.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

if (document.querySelector('[data-avatar-menu]')) {
  initAvatarMenus();
}
