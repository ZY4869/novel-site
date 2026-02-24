const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;

async function getAttempt(env, ipHash) {
  return env.DB.prepare('SELECT fail_count, locked_until FROM auth_attempts WHERE ip_hash = ?').bind(ipHash).first();
}

export async function isIpLocked(env, ipHash) {
  try {
    const r = await getAttempt(env, ipHash);
    if (!r) return false;
    return r.locked_until && new Date(r.locked_until) > new Date();
  } catch {
    return true; // fail-closed: DB 异常时拒绝登录
  }
}

export async function recordFailedAttempt(env, ipHash) {
  try {
    const r = await getAttempt(env, ipHash);
    if (!r) {
      await env.DB.prepare(
        "INSERT INTO auth_attempts (ip_hash, fail_count, last_attempt) VALUES (?, 1, datetime('now'))"
      )
        .bind(ipHash)
        .run();
      return;
    }

    if (r.locked_until && new Date(r.locked_until) <= new Date()) {
      await env.DB.prepare(
        "UPDATE auth_attempts SET fail_count = 1, locked_until = NULL, last_attempt = datetime('now') WHERE ip_hash = ?"
      )
        .bind(ipHash)
        .run();
      return;
    }

    const n = r.fail_count + 1;
    if (n >= MAX_ATTEMPTS) {
      const lock = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      await env.DB.prepare(
        "UPDATE auth_attempts SET fail_count = ?, locked_until = ?, last_attempt = datetime('now') WHERE ip_hash = ?"
      )
        .bind(n, lock, ipHash)
        .run();
      return;
    }

    await env.DB.prepare("UPDATE auth_attempts SET fail_count = ?, last_attempt = datetime('now') WHERE ip_hash = ?")
      .bind(n, ipHash)
      .run();
  } catch {}
}

export async function clearFailedAttempts(env, ipHash) {
  try {
    await env.DB.prepare('DELETE FROM auth_attempts WHERE ip_hash = ?').bind(ipHash).run();
  } catch {}
}

