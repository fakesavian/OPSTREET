#!/usr/bin/env bash
# OPFun Smoke Test — automated version of docs/TESTNET_SMOKE.md
#
# Usage:
#   bash scripts/smoke-test.sh
#   API_URL=https://api.opfun.xyz ADMIN_SECRET=xxx bash scripts/smoke-test.sh
#
# Requires: curl, python3
# Exits: 0 if all steps pass, 1 on any failure

set -euo pipefail

API_URL="${API_URL:-http://localhost:3001}"
ADMIN_SECRET="${ADMIN_SECRET:-dev-secret-change-me}"
FAILURES=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

echo ""
echo "OPFun Smoke Test"
echo "API: $API_URL"
echo "=================================="

# ── Step 1: Create project ────────────────────────────────────────────────────
info "Step 1: Create project"
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"SmokeToken","ticker":"SMK","decimals":8,"maxSupply":"1000000000","description":"Automated smoke test","links":{}}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "201" ]; then
  pass "Step 1: Create project → $HTTP_CODE"
  PROJECT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  PROJECT_SLUG=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
  info "  id=$PROJECT_ID  slug=$PROJECT_SLUG"
else
  fail "Step 1: Create project → expected 201, got $HTTP_CODE"
  echo "  Response: $BODY"
  exit 1  # can't continue without a project
fi

# ── Step 2: Run checks ────────────────────────────────────────────────────────
info "Step 2: Run checks"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/projects/$PROJECT_ID/run-checks")
if [ "$HTTP_CODE" = "202" ]; then
  pass "Step 2: Run checks → $HTTP_CODE"
else
  fail "Step 2: Run checks → expected 202, got $HTTP_CODE"
fi

# ── Step 3: Poll for READY (max 60s) ─────────────────────────────────────────
info "Step 3: Poll for READY (max 60s)"
FINAL_STATUS=""
for i in $(seq 1 12); do
  sleep 5
  FINAL_STATUS=$(curl -s "$API_URL/projects/$PROJECT_SLUG" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  info "  [$i/12] status=$FINAL_STATUS"
  if [ "$FINAL_STATUS" = "READY" ] || [ "$FINAL_STATUS" = "FLAGGED" ]; then
    break
  fi
done

if [ "$FINAL_STATUS" = "READY" ] || [ "$FINAL_STATUS" = "FLAGGED" ]; then
  pass "Step 3: Reached $FINAL_STATUS within 60s"
else
  fail "Step 3: Status did not reach READY/FLAGGED within 60s (last: $FINAL_STATUS)"
fi

# ── Step 4: Confirm-deploy (placeholder address) ──────────────────────────────
info "Step 4: Confirm-deploy"
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/projects/$PROJECT_ID/confirm-deploy" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"contractAddress":"tb1p0000000000000000000000000000000000000000000000000000000000test","deployTx":"0000000000000000000000000000000000000000000000000000000000000000"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  LAUNCH_STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  if [ "$LAUNCH_STATUS" = "LAUNCHED" ]; then
    pass "Step 4: Confirm-deploy → $HTTP_CODE (status=LAUNCHED)"
  else
    fail "Step 4: Confirm-deploy → expected status LAUNCHED, got '$LAUNCH_STATUS'"
  fi
else
  fail "Step 4: Confirm-deploy → expected 200, got $HTTP_CODE"
  echo "  Response: $BODY"
fi

# ── Step 5: Verify LAUNCHED ───────────────────────────────────────────────────
info "Step 5: Verify LAUNCHED"
RESPONSE=$(curl -s "$API_URL/projects/$PROJECT_SLUG")
VERIFY_STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
CONTRACT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('contractAddress') or 'none')" 2>/dev/null || echo "none")

if [ "$VERIFY_STATUS" = "LAUNCHED" ]; then
  pass "Step 5: status=LAUNCHED  contractAddress=$CONTRACT"
else
  fail "Step 5: Expected LAUNCHED, got '$VERIFY_STATUS'"
fi

# ── Step 6: Watch events (expect ≥ 0) ────────────────────────────────────────
info "Step 6: Check watchEvents"
WATCH_COUNT=$(curl -s "$API_URL/projects/$PROJECT_SLUG" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('watchEvents',[])))" 2>/dev/null || echo "-1")
if [ "$WATCH_COUNT" != "-1" ]; then
  pass "Step 6: watchEvents count=$WATCH_COUNT (watcher may not have cycled yet)"
else
  fail "Step 6: Failed to read watchEvents"
fi

# ── Step 7a: Pledge without auth → 401 ───────────────────────────────────────
info "Step 7a: Pledge without cookie → expect 401"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/projects/$PROJECT_ID/pledge" \
  -H "Content-Type: application/json" -d '{}')
if [ "$HTTP_CODE" = "401" ]; then
  pass "Step 7a: Pledge no-auth → $HTTP_CODE"
else
  fail "Step 7a: Expected 401, got $HTTP_CODE"
fi

# ── Step 7b: Nonce endpoint → 200 + {nonce, message} ─────────────────────────
info "Step 7b: Get nonce"
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/auth/nonce" \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"bc1psmoketest00000000000000000000000000000"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  HAS_FIELDS=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'nonce' in d and 'message' in d and 'expiresAt' in d else 'no')" 2>/dev/null || echo "no")
  if [ "$HAS_FIELDS" = "yes" ]; then
    pass "Step 7b: Nonce endpoint → $HTTP_CODE (nonce + message + expiresAt present)"
  else
    fail "Step 7b: Nonce endpoint → $HTTP_CODE but missing expected fields"
  fi
else
  fail "Step 7b: Expected 200, got $HTTP_CODE"
fi

# ── Step 7c: /auth/me without cookie → 401 ───────────────────────────────────
info "Step 7c: /auth/me without cookie → expect 401"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/auth/me")
if [ "$HTTP_CODE" = "401" ]; then
  pass "Step 7c: /auth/me no-auth → $HTTP_CODE"
else
  fail "Step 7c: Expected 401, got $HTTP_CODE"
fi

# ── Step 7d: Rate limit (nonce endpoint, 10 req/min) ─────────────────────────
# Note: step 7b already consumed 1 of the 10 allowed nonce requests this minute.
# So 9 more requests should succeed, then the 10th triggers 429.
info "Step 7d: Rate limit test (9 more ok after step 7b, then 429)"
RL_WALLET="bc1pratelimitest000000000000000000000000000"
RL_OK=0
RL_FAIL_EARLY=0

for i in $(seq 1 9); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/nonce" \
    -H "Content-Type: application/json" \
    -d "{\"walletAddress\":\"$RL_WALLET\"}")
  if [ "$CODE" = "200" ]; then
    RL_OK=$((RL_OK + 1))
  else
    fail "Step 7d: Request $i expected 200, got $CODE (budget exhausted earlier than expected)"
    RL_FAIL_EARLY=1
    break
  fi
done

if [ "$RL_FAIL_EARLY" = "0" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/nonce" \
    -H "Content-Type: application/json" \
    -d "{\"walletAddress\":\"$RL_WALLET\"}")
  if [ "$CODE" = "429" ]; then
    pass "Step 7d: Rate limit → ${RL_OK}× 200, 10th → 429"
  else
    fail "Step 7d: Expected 429 on 10th request (11th total), got $CODE"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=================================="
if [ "$FAILURES" = "0" ]; then
  echo -e "${GREEN}All tests passed${NC}"
  exit 0
else
  echo -e "${RED}${FAILURES} test(s) failed${NC}"
  exit 1
fi
