// Mock SMS / email / owner-alert endpoint. Logs what WOULD be sent; sends nothing anywhere.
// node lead-responder/mock/mock-sender.mjs   (PORT=8787, LOG_FILE=./mock-sent.jsonl)
import http from 'node:http'; import fs from 'node:fs';
const PORT = Number(process.env.PORT || 8787); const LOG = process.env.LOG_FILE || 'mock-sent.jsonl';
http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/log') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])); }
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    let body; try { body = JSON.parse(b || '{}'); } catch { body = { raw: b }; }
    if (req.url.endsWith('/chat/completions')) { // fake OpenAI-compatible LLM for local testing of the LLM path
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ reply: 'Hi there, thanks for reaching out. (mock LLM reply)', questions: ['Mock question one?', 'Mock question two?'] }) } }] })); }
    const rec = { at: new Date().toISOString(), kind: req.url.replace(/^\//, ''), mock: true, body };
    fs.appendFileSync(LOG, JSON.stringify(rec) + '\n'); console.log('[MOCK, not sent]', rec.kind, JSON.stringify(body));
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, mock: true, delivered: false, kind: rec.kind }));
  });
}).listen(PORT, () => console.log(`mock sender on :${PORT}, logging to ${LOG}`));
