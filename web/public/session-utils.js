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
