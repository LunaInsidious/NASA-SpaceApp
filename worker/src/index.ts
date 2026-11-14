// Cloudflare Worker（DONKI の中継とランキングの API を置く場所）。いまは /api/health だけ
export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/api/health') {
      return Response.json({ ok: true });
    }
    return new Response('Not Found', { status: 404 });
  },
};
