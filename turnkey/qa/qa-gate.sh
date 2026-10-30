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
g(){ rg -qi "$2" "$REPO" -g '!node_modules' -g '!dist*' && ok "$1" || bad "$1 not found in source"; }
g "A2 forgot-password" 'forgot|reset[-_ ]?password'
g "A3 rate limit" 'rate.?limit|RL_MAX|lockout'
g "A4 turnstile" 'turnstile'
curl -s "$URL" | grep -Eqi 'href="[^"]*(owner|admin|demo/owner)' && bad "D2 owner/demo link in public home menu" || ok "D2 no owner link on home"
for k in A1 A2 A3 A4 A6 A7 C1 C2 D1 E1 E2 G1 H1 H2 U1; do
  grep -Eq "^$k: (PASS|N/A) .+" "$EV" 2>/dev/null && ok "$k evidence" || bad "$k manual evidence missing in $EV"; done
[[ $fail == 0 ]] && echo "QA GATE: PASS" || echo "QA GATE: FAIL — not done, do not ask William"; exit $fail
