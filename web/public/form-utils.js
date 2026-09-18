export function initials(displayName) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

export function clearFieldError(id) {
  const el = document.getElementById(id + '-error');
  const input = document.getElementById(id);
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
  if (input) input.classList.remove('has-error');
}

export function setFieldError(id, message) {
  const el = document.getElementById(id + '-error');
  const input = document.getElementById(id);
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
  if (input) input.classList.add('has-error');
}
