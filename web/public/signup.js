import { clearFieldError, setFieldError } from './form-utils.js';

function hideDuplicateBanner() {
  const banner = document.getElementById('duplicate-banner');
  if (banner) banner.hidden = true;
}

function showDuplicateBanner(email) {
  const banner = document.getElementById('duplicate-banner');
  const body = document.getElementById('duplicate-banner-body');
  body.textContent = `${email} already has an account. No new account was created.`;
  banner.hidden = false;
}

export async function submitSignupForm({ email, password, displayName } = {}) {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const displayNameInput = document.getElementById('displayname');

  if (email !== undefined) emailInput.value = email;
  if (password !== undefined) passwordInput.value = password;
  if (displayName !== undefined) displayNameInput.value = displayName;

  ['email', 'password', 'displayname'].forEach(clearFieldError);
  hideDuplicateBanner();

  const values = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
    displayName: displayNameInput.value.trim(),
  };

  let hasError = false;
  if (!values.email) {
    setFieldError('email', 'Enter an email to continue.');
    hasError = true;
  }
  if (!values.password) {
    setFieldError('password', 'Enter a password to continue.');
    hasError = true;
  }
  if (!values.displayName) {
    setFieldError('displayname', 'Enter a display name to continue.');
    hasError = true;
  }
  if (hasError) return { ok: false };

  const submitBtn = document.getElementById('signup-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account…';

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        display_name: values.displayName,
      }),
    });
    const data = await res.json();

    if (res.status === 409) {
      setFieldError('email', data.message);
      showDuplicateBanner(values.email);
      return { ok: false };
    }
    if (res.status === 400) {
      const fieldId = data.field === 'display_name' ? 'displayname' : data.field;
      setFieldError(fieldId, data.message);
      return { ok: false };
    }
    if (res.status === 201) {
      window.location.href = 'dashboard.html';
      return { ok: true };
    }
    return { ok: false };
  } catch (error) {
    console.error('signup_fetch_failed', { error });
    setFieldError('email', 'Something went wrong. Please try again.');
    return { ok: false };
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
}

const form = document.getElementById('signup-form');
if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSignupForm();
  });
}
