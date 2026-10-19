// Regenerates presets/trades.json and src/themes.css from client-site-templates so
// --theme names, colors and services match the one-pager mockups.
// Usage: node tools/make-presets.mjs [path/to/client-site-templates]
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const cst = process.argv[2] || '/workspace/client-site-templates';
if (fs.existsSync(path.join(cst, 'tools/library.mjs'))) fs.copyFileSync(path.join(cst, 'tools/library.mjs'), path.join(root, 'tools/library.vendor.mjs'));
const lib = await import(url.pathToFileURL(path.join(root, 'tools/library.vendor.mjs')).href);
const presets = {};
for (const [k, c] of Object.entries(lib.CATEGORIES)) presets[k] = { label: c.label, theme: c.theme, colors: c.defaults, services: c.services.map(([name, summary]) => ({ name, summary })) };
// Legacy one-pager trades (TEMPLATES in tools/mockup.mjs, not exported) — read from source.
const mock = path.join(cst, 'tools/mockup.mjs');
if (fs.existsSync(mock)) {
  const src = fs.readFileSync(mock, 'utf8');
  const m = src.match(/const TEMPLATES = (\{[\s\S]*?\n\});/);
  if (m) { const T = Function(`return ${m[1]}`)();
    for (const [k, t] of Object.entries(T)) if (!presets[k] && t.services) presets[k] = { label: k.replace(/-/g, ' '), theme: 'clean-minimal', colors: t.defaults, services: t.services.map(([name, summary]) => ({ name, summary })) }; }
}
fs.writeFileSync(path.join(root, 'presets/trades.json'), JSON.stringify(presets, null, 2));
const hex = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const shade = (a, t) => mix(a, '#000000', t);
fs.writeFileSync(path.join(root, 'presets/themes.json'), JSON.stringify(Object.fromEntries(Object.entries(lib.THEMES).map(([k, t]) => [k, { dark: !!t.dark, css: t.css }])), null, 2));
console.log(Object.keys(presets).length, 'trades;', Object.keys(lib.THEMES).length, 'themes');
export { mix, shade };
