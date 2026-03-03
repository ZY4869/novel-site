export function setDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(text ?? '');
}

export function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

export function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

export function getRadio(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

