import { checkSessionAndReveal } from './session-utils.js';

function revealWelcome() {
  document.getElementById('welcome-checking').hidden = true;
  document.getElementById('welcome-content').hidden = false;
}

export async function checkWelcomeSession() {
  return checkSessionAndReveal(revealWelcome);
}

if (document.getElementById('welcome-checking')) {
  checkWelcomeSession();
}
