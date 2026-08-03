#!/usr/bin/env bash

# JWT refresh-token fix verification checklist
# Usage: bash verify_jwt_fix.sh

set -u

heading() {
  printf '%s\n' "$1"
}

ok() {
  printf '  [OK] %s\n' "$1"
}

warn() {
  printf '  [WARN] %s\n' "$1"
}

fail() {
  printf '  [FAIL] %s\n' "$1"
}

heading "JWT Refresh Token Fix Verification Checklist"
heading "============================================"
printf '\n'

heading "[1] Environment Variables"
if [ -z "${JWT_SECRET:-}" ]; then
  fail "JWT_SECRET is not set"
else
  ok "JWT_SECRET is set (${#JWT_SECRET} chars)"
fi

if [ -z "${REFRESH_TOKEN_SECRET:-}" ]; then
  warn "REFRESH_TOKEN_SECRET is not set (fallback is JWT_SECRET)"
elif [ "${REFRESH_TOKEN_SECRET}" = "${JWT_SECRET:-}" ]; then
  warn "REFRESH_TOKEN_SECRET equals JWT_SECRET (use different values)"
else
  ok "REFRESH_TOKEN_SECRET is set separately (${#REFRESH_TOKEN_SECRET} chars)"
fi
printf '\n'

heading "[2] Server Startup (manual)"
printf '  Run: npm run dev\n'
printf '  Look for: JWT Configuration Diagnostics\n'
printf '  Look for: JWT Signing & Verification Test\n'
printf '  Expected entries: accessTokenSign/accessTokenVerify/refreshTokenSign/refreshTokenVerify\n'
printf '\n'

heading "[3] Required Files"
files=(
  "server/utils/auth.ts"
  "server/controllers/authController.ts"
  "server/utils/jwtDiagnostics.ts"
  "server.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    ok "$file exists"
  else
    fail "$file is missing"
  fi
done
printf '\n'

heading "[4] Key Code Checks"
if grep -q "REFRESH_TOKEN_SECRET" "server/utils/auth.ts"; then
  ok "REFRESH_TOKEN_SECRET reference found in server/utils/auth.ts"
else
  fail "REFRESH_TOKEN_SECRET reference missing in server/utils/auth.ts"
fi

if grep -q "createRefreshToken" "server/utils/auth.ts"; then
  ok "createRefreshToken function found in server/utils/auth.ts"
else
  fail "createRefreshToken function missing in server/utils/auth.ts"
fi
printf '\n'

heading "[5] API Quick Test (manual)"
printf '  1. POST /api/auth/login\n'
printf '  2. Wait ~30 seconds\n'
printf '  3. POST /api/auth/refresh\n'
printf '  Expected: refresh succeeds and returns a new access token\n'
printf '\n'

heading "[6] Browser Cookie Check (manual)"
printf '  1. Open DevTools\n'
printf '  2. Navigate to Application > Cookies\n'
printf '  3. Check for vault_refresh_token\n'
printf '  4. Validate HttpOnly, Secure, SameSite attributes\n'
printf '\n'

heading "[7] Error Log Check (manual)"
printf "  Should NOT contain:\n"
printf "    - invalid signature\n"
printf "    - Failed to refresh session - invalid token\n"
printf "    - Refresh Token Verification Failed\n"
printf '\n'

heading "============================================"
heading "Checklist complete."
printf '\n'
printf 'If any checks failed:\n'
printf '  1. Restart the server (npm run dev)\n'
printf '  2. Verify .env values for JWT_SECRET and REFRESH_TOKEN_SECRET\n'
printf '  3. Clear browser cookies and login again\n'
printf '  4. Re-check server logs for JWT diagnostics\n'
