export function initAvatarMenus() {
  document.querySelectorAll('[data-avatar-menu]').forEach((menu) => {
    const trigger = menu.querySelector('[data-avatar-trigger]');
    const dropdown = menu.querySelector('[data-avatar-dropdown]');
    if (!trigger || !dropdown) return;

    const closeMenu = () => {
      dropdown.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };

    const getMenuItems = () => Array.from(dropdown.querySelectorAll('[role="menuitem"]'));

    trigger.addEventListener('click', () => {
      const isOpen = !dropdown.hidden;
      dropdown.hidden = isOpen;
      trigger.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) getMenuItems()[0]?.focus();
    });

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) closeMenu();
    });

    menu.addEventListener('keydown', (event) => {
      if (dropdown.hidden) return;
      const items = getMenuItems();
      const currentIndex = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        closeMenu();
        trigger.focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(currentIndex + 1) % items.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
      }
    });
  });
}

if (document.querySelector('[data-avatar-menu]')) {
  initAvatarMenus();
}
