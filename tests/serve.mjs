// Serves dist-demo under /multipage-template/ like GitHub Pages would.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };
export function serve(dir, prefix = '/multipage-template/') {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(prefix)) { res.writeHead(404); return res.end(); }
    p = path.join(dir, p.slice(prefix.length)); if (p.endsWith('/') || (fs.existsSync(p) && fs.statSync(p).isDirectory())) p = path.join(p, 'index.html');
    if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => s.listen(0, () => r({ url: `http://127.0.0.1:${s.address().port}${prefix}`, close: () => s.close() })));
}
