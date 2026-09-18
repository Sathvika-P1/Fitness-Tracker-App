function revealWelcome() {
  document.getElementById('welcome-checking').hidden = true;
  document.getElementById('welcome-content').hidden = false;
}

export async function checkWelcomeSession() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 200) {
      window.location.href = 'dashboard.html';
      return;
    }
    revealWelcome();
  } catch (error) {
    console.error('welcome_session_check_failed', { error });
    revealWelcome();
  }
}

if (document.getElementById('welcome-checking')) {
  checkWelcomeSession();
}
