// 公共中间件：安全头 + CORS + 错误处理 + 请求大小限制 + 访问统计
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const isAdminApi = url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/auth');

  // admin API不返回CORS头（仅同源访问）
  const corsOrigin = isAdminApi ? null : '*';

  // OPTIONS 预检请求
  if (context.request.method === 'OPTIONS') {
    const headers = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
    if (corsOrigin) headers['Access-Control-Allow-Origin'] = corsOrigin;
    return new Response(null, { status: 204, headers });
  }

  // 请求大小限制
  const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
  const SOURCE_MAX_BYTES = 200 * 1024 * 1024;
  const COMIC_PAGE_MAX_BYTES = 20 * 1024 * 1024;

  const pathname = url.pathname;
  const method = context.request.method;

  const uploadRule = (() => {
    if (method !== 'PUT') return null;
    if (/^\/api\/admin\/books\/\d+\/source$/.test(pathname)) return { maxBytes: SOURCE_MAX_BYTES };
    if (/^\/api\/admin\/comics\/\d+\/source$/.test(pathname)) return { maxBytes: SOURCE_MAX_BYTES };
    if (/^\/api\/admin\/comics\/\d+\/pages\/\d+$/.test(pathname)) return { maxBytes: COMIC_PAGE_MAX_BYTES };
    return null;
  })();

  if (uploadRule) {
    // 上传接口强制要求 X-File-Size（避免 Content-Length 不可靠导致绕过）
    const sizeStr = context.request.headers.get('X-File-Size');
    if (!sizeStr || !/^\d+$/.test(sizeStr)) {
      return Response.json({ error: 'Missing or invalid X-File-Size' }, { status: 400 });
    }
    const size = Number(sizeStr);
    if (!Number.isFinite(size) || size <= 0) {
      return Response.json({ error: 'Invalid X-File-Size' }, { status: 400 });
    }
    if (size > uploadRule.maxBytes) {
      return Response.json({ error: 'Request too large' }, { status: 413 });
    }
  } else {
    const contentLength = parseInt(context.request.headers.get('Content-Length') || '0');
    if (contentLength > DEFAULT_MAX_BYTES) {
      return Response.json({ error: 'Request too large' }, { status: 413 });
    }
  }

  try {
    const response = await context.next();

    // CORS（仅公开API）
    if (corsOrigin) {
      response.headers.set('Access-Control-Allow-Origin', corsOrigin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    // 安全头
    response.headers.set('X-Frame-Options', 'DENY');
    // CSP：默认仅允许同源脚本。批注管理页使用内联脚本，单独放开（其余页面保持更严格策略）。
    const allowInlineScripts =
      url.pathname === '/annotation-admin.html' ||
      url.pathname === '/annotation-admin';
    const scriptSrc = allowInlineScripts
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self'";
    response.headers.set(
      'Content-Security-Policy',
      `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://avatars.githubusercontent.com; font-src 'self'; frame-ancestors 'none'`
    );
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // 访问统计（异步，不阻塞响应）
    if (!isAdminApi && context.request.method === 'GET' && url.pathname.startsWith('/api/')) {
      context.waitUntil(trackVisit(context.env, context.request));
    }

    return response;
  } catch (err) {
    console.error('Internal error:', err);
    return Response.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 异步记录PV/UV
async function trackVisit(env, request) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    // IP哈希（不存原始IP）
    const encoder = new TextEncoder();
    const data = encoder.encode(ip + (env.IP_SALT || 'novel-site-default-salt'));
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const ipHash = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

    // PV +1
    await env.DB.prepare(
      "INSERT INTO site_visits (date, pv, uv) VALUES (?, 1, 0) ON CONFLICT(date) DO UPDATE SET pv = pv + 1"
    ).bind(today).run();

    // UV去重
    const exists = await env.DB.prepare(
      "SELECT 1 FROM daily_visitors WHERE date = ? AND ip_hash = ?"
    ).bind(today, ipHash).first();

    if (!exists) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO daily_visitors (date, ip_hash) VALUES (?, ?)"
      ).bind(today, ipHash).run();
      await env.DB.prepare(
        "UPDATE site_visits SET uv = uv + 1 WHERE date = ?"
      ).bind(today).run();
    }

    // 10%概率清理7天前的UV明细（节省空间）
    if (Math.random() < 0.1) {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      await env.DB.prepare("DELETE FROM daily_visitors WHERE date < ?").bind(weekAgo).run();
    }
  } catch (e) {
    console.error('Track visit error:', e);
  }
}
