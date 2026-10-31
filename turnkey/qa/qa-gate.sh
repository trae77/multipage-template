#!/usr/bin/env bash
# Usage: qa-gate.sh <preview-url> <repo-dir> <evidence-file.md>
# Exits non-zero if ANY baseline item fails. Evidence file must mark manual items: "A6: PASS <proof>".
set -u; URL=${1:?url}; REPO=${2:?repo}; EV=${3:?evidence}; fail=0
ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; fail=1; }
H=$(curl -sSI "$URL" | tr 'A-Z' 'a-z')
for h in strict-transport-security content-security-policy x-content-type-options referrer-policy; do
  echo "$H" | grep -q "^$h:" && ok "B1 $h" || bad "B1 header $h"; done
for p in /.env /.git/config /admin /wp-admin; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$URL$p"); [[ $c == 404 || $c == 403 ]] && ok "B2 $p=$c" || bad "B2 $p=$c"; done
curl -s "$URL" | grep -qi 'noindex' && ok "F1 noindex (preview)" || bad "F1 noindex missing (ok only if live+approved)"
c=$(curl -s -o /dev/null -w '%{http_code}' "$URL/owner/"); [[ $c =~ ^(302|401|403)$ ]] && ok "A5 /owner/ gated ($c)" || bad "A5 /owner/ open ($c)"
# G1 fix (QA punch 2026-10-30): source checks look at CODE only. Docs, *.md, qa/, tests, the gate and its helpers never count.
X=(-g '!node_modules' -g '!dist*' -g '!*.md' -g '!*.txt' -g '!docs/**' -g '!**/docs/**' -g '!qa/**' -g '!**/qa/**' -g '!test/**' -g '!tests/**' -g '!**/tests/**' -g '!**/test/**' -g '!*.test.*' -g '!*.spec.*' -g '!qa-gate.sh*' -g '!*-render.mjs' -g '!.github/**' -g '!*.bak*')
C=(-g '*.{js,mjs,cjs,ts,tsx,jsx,py,php,rb,go,html,vue,svelte}')
rgc(){ rg -qi -P "$@" "$REPO" "${C[@]}" "${X[@]}"; }
g(){ rgc "$2" && ok "$1" || bad "$1 not found in source code (docs/tests/qa excluded)"; }
# A2 (G1 fix v2, 2026-10-30): ALL of (a) route handler in CODE, (b) live probe when URL given, (c) manual evidence. No N/A path: missing = FAIL.
# Delimiters include / so regex-literal routes (path.match(/^\/api\/...invite$/)) count; template routes (`${apiBase}/forgot`) count.
HANDLER='(?:\b(?:path|pathname|url|route|p)\b[^\n]{0,30}(?:===?|startsWith\(|match\(|case)\s*[\x27"`/][^\x27"`\n]*@@[^\x27"`\n]*[\x27"`/]|\.(?:post|get|put|all|route|use)\(\s*[\x27"`][^\x27"`\n]*@@[^\x27"`\n]*[\x27"`])'
if [[ -z $(rg --files "$REPO" "${C[@]}" "${X[@]}" 2>/dev/null | head -1) ]]; then
  bad "A2a no source code found (docs-only repo cannot pass)"
else
  rgc "${HANDLER//@@/(?:forgot|reset)}" && ok "A2a forgot/reset route handler in code" || bad "A2a forgot/reset route handler not found in code"
  rgc "${HANDLER//@@/invite}" && ok "A2a owner re-invite route handler in code" || bad "A2a owner re-invite route handler not found in code"
fi
# (b) live probe: exactly 2 POSTs, qatest + obviously-fake address. NEVER a real owner email. Path override: A2_FORGOT_PATH.
if [[ $URL != "-" ]]; then
  FP=${A2_FORGOT_PATH:-}; [[ -z $FP ]] && { rgc '/api/auth/forgot|\$\{apiBase\}/forgot' && FP=/api/auth/forgot || FP=/api/forgot; }
  pr(){ curl -s -m 15 -X POST -H 'content-type: application/json' -H "origin: ${URL%/}" -d "{\"email\":\"$1\",\"website\":\"\"}" -w '\n%{http_code}' "${URL%/}$FP"; }
  r1=$(pr 'tta.dev.web+qatest@gmail.com'); r2=$(pr 'nobody-qa-probe@example.invalid')
  c1=${r1##*$'\n'}; c2=${r2##*$'\n'}
  if ! [[ $c1 =~ ^(2[0-9][0-9]|400|401|403|422|429)$ ]]; then bad "A2b forgot route $FP not live ($c1; 404/405/5xx/timeout = no handler)"
  elif [[ $r1 != "$r2" ]]; then bad "A2b known vs unknown email responses differ ($c1 vs $c2) at $FP"
  else ok "A2b $FP live ($c1), identical reply for qatest vs fake email"; fi
else bad "A2b no URL: live probe not run (cannot PASS on source alone)"; fi
# (c) manual proof the real email arrived + link single-use + expires
grep -Eqi '^A2: PASS .*qatest.*' "$EV" 2>/dev/null && grep -Eqi '^A2: PASS .*single.?use' "$EV" && grep -Eqi '^A2: PASS .*expir' "$EV" \
  && ok "A2c evidence: reset email at qatest, single-use, expires" || bad "A2c manual evidence missing: need 'A2: PASS' line citing qatest arrival, single-use and expiry in $EV"
g "A3 rate limit" 'rate.?limit|RL_MAX|lockout'
g "A4 turnstile" 'turnstile'
# D2 allows /demo/ menu links (William via CEO, Oct 30); real /owner /login /admin still FAIL.
# D2 on the RENDERED DOM (SPAs build nav in JS; curl alone false-PASSes). Browser unavailable => FAIL, never PASS.
D2JS="${D2_RENDER:-$(dirname "$0")/d2-render.mjs}"
if [[ -f $D2JS ]] && command -v node >/dev/null; then NODE_PATH=/tmp/bf-pw/node_modules node "$D2JS" "$URL"; rc=$?; else rc=2; fi
if [[ $rc == 0 ]]; then ok "D2 no visible owner/login link in rendered nav/footer (headless chromium)"
elif [[ $rc == 1 ]]; then bad "D2 visible owner/login link in rendered nav/footer"
else curl -s "$URL" | grep -Eoi 'href="[^"]*"' | grep -Evi '/demo(/|")' | grep -Eqi '(owner|admin|login)' && bad "D2 owner/login link in raw HTML" || bad "D2 browser unavailable: curl fallback cannot prove a JS-built nav is clean"; fi
# D3/D4 (William via CEO relay 2026-10-30, DoD "Preview demo links"): RENDERED DOM, browser unavailable => FAIL.
DNJS="${DEMO_NAV_RENDER:-$(dirname "$0")/demo-nav-render.mjs}"
if [[ -f $DNJS ]] && command -v node >/dev/null; then NODE_PATH=/tmp/bf-pw/node_modules node "$DNJS" "$URL" "${D4_MAX_PAGES:-40}" ; rc=${PIPESTATUS[0]}; else rc=4; fi
(( rc & 4 )) && bad "D3/D4 browser unavailable: cannot prove demo links / no real /owner/ link"
(( rc & 1 )) && bad "D3 Owner demo + Client demo links missing from main menu (see above)"
(( rc & 2 )) && bad "D4 real /owner/ linked from site (see above)"
(( rc == 0 )) && ok "D3+D4 demo links in menu at 1280/768/390, no real /owner/ href"
for k in A1 A3 A4 A6 A7 C1 C2 D1 E1 E2 G1 H1 H2 U1; do
  grep -Eq "^$k: (PASS|N/A) .+" "$EV" 2>/dev/null && ok "$k evidence" || bad "$k manual evidence missing in $EV"; done
[[ $fail == 0 ]] && echo "QA GATE: PASS" || echo "QA GATE: FAIL — not done, do not ask William"; exit $fail
