export const auth = {
  token: '',
  role: '',
  userId: 0,
  passwordLocked: false,
};

export function loadAuthFromSession() {
  try {
    auth.token = sessionStorage.getItem('auth_token') || '';
    auth.role = sessionStorage.getItem('auth_role') || '';
    auth.userId = Number(sessionStorage.getItem('auth_uid')) || 0;
  } catch {
    auth.token = '';
    auth.role = '';
    auth.userId = 0;
  }
  auth.passwordLocked = false;
}

export function saveAuthToSession() {
  try {
    sessionStorage.setItem('auth_token', auth.token || '');
    sessionStorage.setItem('auth_role', auth.role || '');
    sessionStorage.setItem('auth_uid', String(auth.userId || 0));
  } catch {}
}

export function clearAuth() {
  auth.token = '';
  auth.role = '';
  auth.userId = 0;
  auth.passwordLocked = false;
  try {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_role');
    sessionStorage.removeItem('auth_uid');
  } catch {}
}

export function getToken() {
  return auth.token || '';
}

