import { generateToken, sha256Hash } from './crypto.js';
import { isIpLocked, recordFailedAttempt, clearFailedAttempts } from './ipLock.js';
import { hashPassword, verifyPassword } from './password.js';
import { ensureSchema } from './schema.js';

function normalizeRole(role) {
  return role === 'editor' ? 'admin' : role || 'demo';
}

function getTokenFromRequest(request) {
  // 优先从 HttpOnly Cookie 获取（更安全）
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (cookieMatch && cookieMatch[1] && cookieMatch[1].length >= 10) return cookieMatch[1];

  // fallback: Bearer header（兼容旧前端/脚本）
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (token && token.length >= 10) return token;
  return null;
}

async function getSessionByTokenHash(env, tokenHash) {
  return env.DB.prepare(
    'SELECT s.user_id, s.expires_at, u.username, u.role, u.password_locked FROM admin_sessions s JOIN admin_users u ON s.user_id = u.id WHERE s.token = ?'
  )
    .bind(tokenHash)
    .first();
}

async function deleteSession(env, tokenHash) {
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(tokenHash).run();
}

async function maybeCleanup(env) {
  if (Math.random() >= 0.1) return;
  await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')").run().catch(() => {});
  await env.DB.prepare("DELETE FROM auth_attempts WHERE last_attempt < datetime('now', '-1 day')").run().catch(() => {});
  await env.DB
    .prepare("DELETE FROM site_settings WHERE key LIKE 'oauth_state:%' AND value < datetime('now')")
    .run()
    .catch(() => {});
}

async function pruneSessions(env, userId) {
  await env.DB
    .prepare(
      'DELETE FROM admin_sessions WHERE user_id = ? AND token NOT IN (SELECT token FROM admin_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10)'
    )
    .bind(userId, userId)
    .run()
    .catch(() => {});
}

async function ensureDefaultAdmin(env) {
  if (!env.ADMIN_PASSWORD) {
    console.error('FATAL: ADMIN_PASSWORD env not set, refusing to create default admin');
    return;
  }
  try {
    const existing = await env.DB.prepare('SELECT id FROM admin_users WHERE username = ?').bind('admin').first();
    if (existing) return;
    const hash = await hashPassword(env.ADMIN_PASSWORD);
    await env.DB.prepare("INSERT OR IGNORE INTO admin_users (username, password_hash, role) VALUES (?, ?, 'super_admin')")
      .bind('admin', hash)
      .run();
  } catch {}
}

export function makeAuthCookie(token) {
  return `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export function clearAuthCookie() {
  return 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

export async function checkAdmin(request, env) {
  await ensureSchema(env);

  const token = getTokenFromRequest(request);
  if (!token) return { ok: false, reason: 'missing' };

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await sha256Hash(ip);
  if (await isIpLocked(env, ipHash)) return { ok: false, reason: 'locked' };
  if (token.length < 10) return { ok: false, reason: 'invalid' };

  const tokenHash = await sha256Hash(token);
  const session = await getSessionByTokenHash(env, tokenHash);
  if (!session) return { ok: false, reason: 'invalid_token' };

  if (new Date(session.expires_at) < new Date()) {
    await deleteSession(env, tokenHash);
    return { ok: false, reason: 'expired' };
  }

  await maybeCleanup(env);
  return {
    ok: true,
    userId: session.user_id,
    username: session.username,
    role: normalizeRole(session.role),
    passwordLocked: session.password_locked === 1,
    _token: token, // 仅供服务端内部使用（如登出删除session）
  };
}

export async function login(env, username, password, ip) {
  const ipHash = await sha256Hash(ip);
  if (await isIpLocked(env, ipHash)) return { ok: false, reason: 'locked' };

  await ensureDefaultAdmin(env);
  const user = await env.DB.prepare('SELECT id, password_hash, role FROM admin_users WHERE username = ?')
    .bind(username)
    .first();

  if (!user) {
    await recordFailedAttempt(env, ipHash);
    return { ok: false, reason: 'wrong' };
  }
  if (user.password_hash === 'github_oauth:no_password') return { ok: false, reason: 'github_only' };

  const result = await verifyPassword(password, user.password_hash);
  if (!result.match) {
    await recordFailedAttempt(env, ipHash);
    return { ok: false, reason: 'wrong' };
  }

  if (result.needsMigration) {
    const newHash = await hashPassword(password);
    await env.DB
      .prepare("UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(newHash, user.id)
      .run()
      .catch(() => {});
  }

  await clearFailedAttempts(env, ipHash);

  const token = generateToken();
  const tokenHash = await sha256Hash(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare('INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, user.id, expiresAt)
    .run();

  await pruneSessions(env, user.id);
  await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')").run().catch(() => {});
  await env.DB.prepare("DELETE FROM auth_attempts WHERE last_attempt < datetime('now', '-1 day')").run().catch(() => {});

  return { ok: true, token, username: user.username, role: normalizeRole(user.role), userId: user.id, expiresAt };
}

export async function changePassword(env, userId, oldPassword, newPassword) {
  const user = await env.DB.prepare('SELECT password_hash FROM admin_users WHERE id = ?').bind(userId).first();
  if (!user) return { ok: false, reason: 'not_found' };

  const result = await verifyPassword(oldPassword, user.password_hash);
  if (!result.match) return { ok: false, reason: 'wrong_old' };

  if (!newPassword || newPassword.length < 8) return { ok: false, reason: 'too_short' };
  if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) return { ok: false, reason: 'too_weak' };

  const newHash = await hashPassword(newPassword);
  await env.DB
    .prepare("UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(newHash, userId)
    .run();

  await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(userId).run();
  return { ok: true };
}

// 为 GitHub OAuth 用户创建 session（复用现有 token 机制）
export async function createSession(env, userId) {
  const token = generateToken();
  const tokenHash = await sha256Hash(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare('INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expiresAt)
    .run();

  await pruneSessions(env, userId);
  return { token, expiresAt };
}
