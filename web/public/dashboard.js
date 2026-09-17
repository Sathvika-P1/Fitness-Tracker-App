export function initials(displayName) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

export async function loadDashboard() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status !== 200) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    document.getElementById('welcome-name').textContent = `Welcome, ${data.display_name}`;
    document.getElementById('welcome-email').textContent = data.email;
    document.getElementById('avatar-initials').textContent = initials(data.display_name);
  } catch (error) {
    console.error('dashboard_load_failed', { error });
    window.location.href = 'login.html';
  }
}

export async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (error) {
    console.error('logout_fetch_failed', { error });
  }
  window.location.href = 'login.html?logged_out=1';
}

if (document.getElementById('welcome-name')) {
  loadDashboard();
}

document.getElementById('logout-button')?.addEventListener('click', logout);
