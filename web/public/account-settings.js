const views = ['danger-zone', 'confirm', 'deleting', 'complete', 'already-deleted'];

export function showView(name) {
  views.forEach((view) => {
    const el = document.getElementById(`view-${view}`);
    if (el) el.hidden = view !== name;
  });
}

export function updateDeleteButton() {
  const pw = document.getElementById('confirm-password').value;
  const checked = document.getElementById('confirm-checkbox').checked;
  document.getElementById('delete-submit-btn').disabled = !(pw.length > 0 && checked);
}

export async function loadAccount() {
  try {
    const res = await fetch('/api/account', { credentials: 'include' });
    if (res.status !== 200) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    document.getElementById('account-email').textContent = data.email;
    document.getElementById('account-session-count').textContent =
      `${data.active_session_count} device${data.active_session_count === 1 ? '' : 's'}`;
  } catch (error) {
    console.error('account_load_failed', { error });
    window.location.href = 'login.html';
  }
}

export async function submitDeletion(password) {
  let res;
  try {
    res = await fetch('/api/account/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch (error) {
    console.error('account_delete_failed', { error });
    return { ok: false, networkError: true };
  }
  const body = await res.json();
  if (res.status === 200 && body.status === 'already_deleted') {
    return { ok: false, alreadyDeleted: true };
  }
  if (res.status === 200) {
    return { ok: true, sessionsRevoked: body.sessions_revoked };
  }
  if (res.status === 429) {
    return { ok: false, lockedOut: true };
  }
  if (res.status === 401) {
    return { ok: false, incorrectPassword: true };
  }
  return { ok: false };
}

function renderRevokedSessions(sessionsRevoked) {
  const list = document.getElementById('revoked-session-list');
  list.innerHTML = '';
  const count = typeof sessionsRevoked === 'number' && sessionsRevoked > 0 ? sessionsRevoked : 1;
  const row = (label) => {
    const div = document.createElement('div');
    div.className = 'device-row';
    div.innerHTML =
      '<span class="device-icon" aria-hidden="true">📱</span>' +
      `<span>${label}</span>` +
      '<span class="device-status-revoked">Signed out</span>';
    return div;
  };
  list.appendChild(row('This device'));
  for (let i = 1; i < count; i += 1) {
    list.appendChild(row('Another device'));
  }
}

const startDeleteBtn = document.getElementById('start-delete-btn');
const confirmBackBtn = document.getElementById('confirm-back-btn');
const cancelBtn = document.getElementById('cancel-btn');
const completeSigninBtn = document.getElementById('complete-signin-btn');
const alreadyDeletedSigninBtn = document.getElementById('already-deleted-signin-btn');
const passwordInput = document.getElementById('confirm-password');
const checkbox = document.getElementById('confirm-checkbox');
const deleteSubmitBtn = document.getElementById('delete-submit-btn');
const passwordError = document.getElementById('password-error');
const attemptCounter = document.getElementById('attempt-counter');
const lockoutBanner = document.getElementById('lockout-banner');

let attemptsMade = 0;
const MAX_ATTEMPTS = 5;

startDeleteBtn?.addEventListener('click', () => showView('confirm'));
confirmBackBtn?.addEventListener('click', () => showView('danger-zone'));
cancelBtn?.addEventListener('click', () => showView('danger-zone'));
completeSigninBtn?.addEventListener('click', () => {
  window.location.href = 'login.html';
});
alreadyDeletedSigninBtn?.addEventListener('click', () => {
  window.location.href = 'login.html';
});

passwordInput?.addEventListener('input', () => {
  passwordError.hidden = true;
  updateDeleteButton();
});
checkbox?.addEventListener('change', updateDeleteButton);

deleteSubmitBtn?.addEventListener('click', async () => {
  const password = passwordInput.value;
  deleteSubmitBtn.disabled = true;
  showView('deleting');

  const result = await submitDeletion(password);

  if (result.ok) {
    renderRevokedSessions(result.sessionsRevoked);
    showView('complete');
    return;
  }

  if (result.alreadyDeleted) {
    showView('already-deleted');
    return;
  }

  if (result.lockedOut) {
    showView('confirm');
    lockoutBanner.hidden = false;
    passwordInput.disabled = true;
    deleteSubmitBtn.disabled = true;
    return;
  }

  showView('confirm');
  if (result.incorrectPassword) {
    attemptsMade += 1;
    passwordError.hidden = false;
    const remaining = MAX_ATTEMPTS - attemptsMade;
    if (remaining > 0) {
      attemptCounter.hidden = false;
      attemptCounter.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout`;
    }
  }
  updateDeleteButton();
});

if (document.getElementById('view-danger-zone')) {
  loadAccount();
}
