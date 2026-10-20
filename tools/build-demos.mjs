// Static demo for GitHub Pages: main demo (site.config.json trade) at the root, plus one demo per
// main-action type under demos/<trade>/ so each money page can be clicked through.
import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
export const DEMOS = ['restaurant', 'fitness', 'real-estate', 'photography', 'salon-barber', 'dental-medical'];
const run = (...a) => execFileSync(process.execPath, [path.join(ROOT, 'tools/build.mjs'), '--demo', ...a], { stdio: 'inherit' });
run();
for (const t of DEMOS) run('--trade', t, '--out', `dist-demo/demos/${t}`, '--palette', 'auto', '--fonts', 'auto', '--layout', 'auto');
// Simulated AI lead responder page (lead-responder/demo), copied as-is.
fs.mkdirSync(path.join(ROOT, 'dist-demo/demos/lead-responder'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'lead-responder/demo/index.html'), path.join(ROOT, 'dist-demo/demos/lead-responder/index.html'));
const links = DEMOS.map((t) => `<li><a href="${t}/">${t}</a></li>`).join('');
fs.writeFileSync(path.join(ROOT, 'dist-demo/demos/index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Industry demos</title><style>body{font:1.1rem system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem}a{display:inline-block;min-height:44px;padding:.5rem 0}</style><h1>Industry demos (sample data)</h1><ul><li><a href="../">roofing (main demo)</a></li>${links}<li><a href="lead-responder/">AI lead responder (simulation)</a></li></ul>`);
