// 公共中间件：安全头 + CORS + 错误处理 + 请求大小限制
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

  // 请求大小限制（10MB）
  const contentLength = parseInt(context.request.headers.get('Content-Length') || '0');
  if (contentLength > 10 * 1024 * 1024) {
    return Response.json({ error: 'Request too large' }, { status: 413 });
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
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'");
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    return response;
  } catch (err) {
    console.error('Internal error:', err);
    return Response.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
