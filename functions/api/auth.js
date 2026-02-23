// POST /api/auth/login — 管理员登录
// POST /api/auth/logout — 登出
// POST /api/auth/password — 修改密码
// GET /api/auth/me — 验证当前session
import { login, checkAdmin, changePassword, parseJsonBody, sha256Hash } from './_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 路由分发（Pages Functions不支持深层动态路由，用query参数区分）
  const action = url.searchParams.get('action');

  if (action === 'login') {
    const body = await parseJsonBody(request);
    if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    const { username, password } = body;
    if (!username || !password) return Response.json({ error: 'Username and password required' }, { status: 400 });

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const result = await login(env, username.trim(), password, ip);

    if (!result.ok) {
      const status = result.reason === 'locked' ? 429 : 401;
      const msg = result.reason === 'locked' ? '登录失败次数过多，请10分钟后再试'
        : '用户名或密码错误';
      return Response.json({ error: msg }, { status });
    }

    return Response.json({
      success: true,
      token: result.token,
      username: result.username,
      expiresAt: result.expiresAt
    });
  }

  if (action === 'logout') {
    const auth = await checkAdmin(request, env);
    if (!auth.ok) return Response.json({ success: true });
    const token = request.headers.get('Authorization').slice(7);
    const tokenHash = await sha256Hash(token);
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(tokenHash).run();
    return Response.json({ success: true });
  }

  if (action === 'password') {
    const auth = await checkAdmin(request, env);
    if (!auth.ok) {
      const status = auth.reason === 'locked' ? 429 : 401;
      return Response.json({ error: 'Unauthorized' }, { status });
    }
    const body = await parseJsonBody(request);
    if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    const { oldPassword, newPassword } = body;
    if (!oldPassword || !newPassword) return Response.json({ error: '请填写旧密码和新密码' }, { status: 400 });

    const result = await changePassword(env, auth.userId, oldPassword, newPassword);
    if (!result.ok) {
      const msg = result.reason === 'wrong_old' ? '旧密码错误'
        : result.reason === 'too_short' ? '新密码至少8位'
        : result.reason === 'too_weak' ? '新密码需包含字母和数字'
        : '修改失败';
      return Response.json({ error: msg }, { status: 400 });
    }

    return Response.json({ success: true, message: '密码已修改，请重新登录' });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'me') {
    const auth = await checkAdmin(request, env);
    if (!auth.ok) return Response.json({ authenticated: false }, { status: 401 });
    return Response.json({ authenticated: true, username: auth.username });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
