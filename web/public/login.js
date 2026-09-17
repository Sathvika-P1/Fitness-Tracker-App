function hideErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.hidden = true;
  document.getElementById('email').classList.remove('has-error');
  document.getElementById('password').classList.remove('has-error');
}

function showErrorBanner({
  title = 'Invalid email or password',
  body = 'Double-check your credentials and try again.',
} = {}) {
  const banner = document.getElementById('error-banner');
  const loggedOutBanner = document.getElementById('logged-out-banner');
  if (loggedOutBanner) loggedOutBanner.hidden = true;
  if (banner) {
    banner.hidden = false;
    banner.querySelector('.banner-title').textContent = title;
    banner.querySelector('.banner-body').textContent = body;
  }
  document.getElementById('email').classList.add('has-error');
  document.getElementById('password').classList.add('has-error');
}

export async function submitLoginForm({ email, password } = {}) {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  if (email !== undefined) emailInput.value = email;
  if (password !== undefined) passwordInput.value = password;

  hideErrorBanner();

  const values = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };

  const submitBtn = document.getElementById('login-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: values.email, password: values.password }),
    });

    if (res.status === 200) {
      window.location.href = 'dashboard.html';
      return { ok: true };
    }
    showErrorBanner();
    return { ok: false };
  } catch (error) {
    console.error('login_fetch_failed', { error });
    showErrorBanner({
      title: 'Unable to reach the server',
      body: 'Check your connection and try again.',
    });
    return { ok: false };
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
}

function revealLoginForm() {
  document.getElementById('session-check-status').hidden = true;
  document.getElementById('login-subtitle').hidden = false;
  document.getElementById('login-form').hidden = false;
  document.getElementById('signup-note').hidden = false;
  if (new URLSearchParams(window.location.search).get('logged_out') === '1') {
    document.getElementById('error-banner').hidden = true;
    document.getElementById('logged-out-banner').hidden = false;
  }
}

export async function checkExistingSession() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 200) {
      window.location.href = 'dashboard.html';
      return;
    }
    revealLoginForm();
  } catch (error) {
    console.error('session_check_failed', { error });
    revealLoginForm();
  }
}

const form = document.getElementById('login-form');
if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitLoginForm();
  });
  checkExistingSession();
}
