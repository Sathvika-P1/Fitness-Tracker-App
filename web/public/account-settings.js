import { initials } from './form-utils.js';
import { fetchOrRedirect, logout as sharedLogout } from './session-utils.js';

export async function loadAccountSummary() {
  const res = await fetchOrRedirect('/api/me');
  if (!res) return;
  const data = await res.json();
  document.getElementById('account-email').textContent = data.email;
  const count = data.active_sessions;
  document.getElementById('active-sessions-count').textContent =
    `${count} device${count === 1 ? '' : 's'}`;
  document.getElementById('avatar-menu-initial').textContent = initials(data.display_name || '');
}

export function logout() {
  return sharedLogout('settings-logout-error');
}

document.getElementById('settings-logout-btn')?.addEventListener('click', logout);

if (document.getElementById('account-email')) {
  loadAccountSummary();
}
