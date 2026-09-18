export async function loadAccountSummary() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status !== 200) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    document.getElementById('account-email').textContent = data.email;
  } catch (error) {
    console.error('account_summary_load_failed', { error });
    window.location.href = 'login.html';
  }
}

if (document.getElementById('account-email')) {
  loadAccountSummary();
}
