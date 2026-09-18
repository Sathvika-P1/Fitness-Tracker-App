import { fetchOrRedirect } from './session-utils.js';

export async function loadAccountSummary() {
  const res = await fetchOrRedirect('/api/me');
  if (!res) return;
  const data = await res.json();
  document.getElementById('account-email').textContent = data.email;
  const count = data.active_sessions;
  document.getElementById('active-sessions-count').textContent =
    `${count} device${count === 1 ? '' : 's'}`;
}

if (document.getElementById('account-email')) {
  loadAccountSummary();
}
