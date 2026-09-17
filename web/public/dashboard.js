export function initials(displayName) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

export async function loadDashboard() {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (res.status !== 200) {
    window.location.href = 'signup.html';
    return;
  }
  const data = await res.json();
  document.getElementById('welcome-name').textContent = `Welcome, ${data.display_name}`;
  document.getElementById('welcome-email').textContent = data.email;
  document.getElementById('avatar-initials').textContent = initials(data.display_name);
}

if (document.getElementById('welcome-name')) {
  loadDashboard();
}
