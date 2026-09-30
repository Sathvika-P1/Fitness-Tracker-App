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

export async function submitEntry(url, values, errorTag) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
  } catch (error) {
    console.error(errorTag, { error });
    return { ok: false, networkError: true };
  }
  if (res.status === 201) {
    return { ok: true, entry: await res.json() };
  }
  if (res.status === 401) {
    return { ok: false, sessionExpired: true };
  }
  if (res.status === 400) {
    const body = await res.json();
    return { ok: false, errors: body.errors || {} };
  }
  return { ok: false, networkError: true };
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

export function goToHistoryDeleted() {
  window.location.href = 'history.html?deleted=1';
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
