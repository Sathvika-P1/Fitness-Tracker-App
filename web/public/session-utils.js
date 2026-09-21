export async function fetchOrRedirect(url, redirectTo = 'login.html') {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status !== 200) {
      window.location.href = redirectTo;
      return null;
    }
    return res;
  } catch (error) {
    console.error('fetch_or_redirect_failed', { url, error });
    window.location.href = redirectTo;
    return null;
  }
}

export async function logout(errorElId) {
  const errorEl = errorElId ? document.getElementById(errorElId) : null;
  if (errorEl) errorEl.hidden = true;
  try {
    const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    if (res.status !== 200) {
      console.error('logout_api_error', { status: res.status });
      if (errorEl) errorEl.hidden = false;
      return;
    }
  } catch (error) {
    console.error('logout_fetch_failed', { error });
    if (errorEl) errorEl.hidden = false;
    return;
  }
  window.location.href = 'login.html?logged_out=1';
}

export async function checkSessionAndReveal(revealFn) {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 200) {
      window.location.href = 'dashboard.html';
      return;
    }
    console.error('session_check_error', { status: res.status });
    revealFn();
  } catch (error) {
    console.error('session_check_failed', { error });
    revealFn();
  }
}
