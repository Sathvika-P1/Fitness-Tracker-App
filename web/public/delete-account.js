const MAX_ATTEMPTS = 5;
let attempts = 0;

function showView(id) {
  ['confirm-view', 'deleting-view', 'complete-view', 'already-deleted-view'].forEach((viewId) => {
    document.getElementById(viewId).hidden = viewId !== id;
  });
}

export function updateDeleteButton() {
  const pw = document.getElementById('confirm-password').value;
  const checked = document.getElementById('confirm-checkbox').checked;
  document.getElementById('delete-submit-btn').disabled = !(pw.length > 0 && checked);
}

export async function submitDeletion(password) {
  const submitBtn = document.getElementById('delete-submit-btn');
  const passwordError = document.getElementById('password-error');
  const intactNote = document.getElementById('intact-note');
  const lockoutBanner = document.getElementById('lockout-banner');
  const attemptCounter = document.getElementById('attempt-counter');

  passwordError.hidden = true;
  intactNote.hidden = true;
  showView('deleting-view');

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
    showView('confirm-view');
    return;
  }

  if (res.status === 200) {
    showView('complete-view');
    return;
  }

  const body = await res.json();

  if (res.status === 423) {
    showView('confirm-view');
    lockoutBanner.hidden = false;
    submitBtn.disabled = true;
    passwordInput.disabled = true;
    return;
  }

  if (body.message === 'Not signed in.') {
    showView('already-deleted-view');
    return;
  }

  attempts += 1;
  showView('confirm-view');
  passwordError.hidden = false;
  intactNote.hidden = false;
  const remaining = MAX_ATTEMPTS - attempts;
  if (remaining > 0) {
    attemptCounter.hidden = false;
    attemptCounter.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout`;
  }
  updateDeleteButton();
}

export async function requireSignedIn() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status !== 200) {
      window.location.href = 'login.html';
    }
  } catch (error) {
    console.error('delete_account_auth_check_failed', { error });
    window.location.href = 'login.html';
  }
}

const passwordInput = document.getElementById('confirm-password');
const checkbox = document.getElementById('confirm-checkbox');
const submitBtn = document.getElementById('delete-submit-btn');

passwordInput?.addEventListener('input', () => {
  document.getElementById('password-error').hidden = true;
  updateDeleteButton();
});
checkbox?.addEventListener('change', updateDeleteButton);
submitBtn?.addEventListener('click', () => {
  submitDeletion(passwordInput.value);
});

if (passwordInput) {
  requireSignedIn();
}
