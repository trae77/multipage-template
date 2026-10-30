// Local preview: runs the real Worker (worker/index.mjs) over dist/ with a file-backed ASSETS binding, on 127.0.0.1.
// Used by setup + CI so ops/standards/qa-gate.sh can run before any deploy. No network, no secrets.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import worker from '../worker/index.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
export function assetsBinding(dist) {
  return { async fetch(req) {
    const u = new URL(req.url); let p = path.join(dist, decodeURIComponent(u.pathname));
    if (!p.startsWith(dist + path.sep) && p !== dist) return new Response('Not found', { status: 404 });
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (path.basename(p).startsWith('.') || path.basename(p) === '_headers' || !fs.existsSync(p)) {
      return new Response(fs.readFileSync(path.join(dist, '404.html')), { status: 404, headers: { 'Content-Type': MIME['.html'] } });
    }
    return new Response(fs.readFileSync(p), { headers: { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' } });
  } };
}
export async function startPreview(dist) {
  const env = { ASSETS: assetsBinding(dist), OWNER_EMAILS: '', ACCESS_TEAM: '', ACCESS_AUD: '' };
  const server = http.createServer(async (req, res) => {
    const url = `http://localhost:${server.address().port}${req.url}`;
    const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers }), env, {});
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://localhost:${server.address().port}`, close: () => server.close() };
}
