import { initials } from './form-utils.js';
import { fetchOrRedirect } from './session-utils.js';

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

export async function logout() {
  const errorEl = document.getElementById('settings-logout-error');
  errorEl.hidden = true;
  try {
    const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    if (res.status !== 200) {
      errorEl.hidden = false;
      return;
    }
  } catch (error) {
    console.error('logout_fetch_failed', { error });
    errorEl.hidden = false;
    return;
  }
  window.location.href = 'login.html?logged_out=1';
}

document.getElementById('settings-logout-btn')?.addEventListener('click', logout);

if (document.getElementById('account-email')) {
  loadAccountSummary();
}
