#!/usr/bin/env bash
# ============================================================
# ROLLBACK STEP 1 — Database (run this BEFORE files rollback)
# Reverts all data created in the Supabase project on 2026-09-12.
# Reads the real keys from the CURRENT .env.local (so run before
# restoring the placeholder .env.local).
# ============================================================
set -e
cd "C:/Users/mabou/Core_dashboard/coregym-coach-dashboard"
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')
SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
H1="apikey: $SRK"
H2="Authorization: Bearer $SRK"

echo "[1/3] Deleting created plan (Starter — 1 Month, 11e11934-ed3a-4a01-a5fc-451c8e2adefb)..."
curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X DELETE \
  "$URL/rest/v1/subscription_plans?id=eq.11e11934-ed3a-4a01-a5fc-451c8e2adefb" \
  -H "$H1" -H "$H2"

echo "[2/3] Deleting demo auth user coach@coregym.com (35724bae-6e3e-4c3e-823f-2f1642b2a73e)..."
echo "      (profile row cascades automatically)"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X DELETE \
  "$URL/auth/v1/admin/users/35724bae-6e3e-4c3e-823f-2f1642b2a73e" \
  -H "$H1" -H "$H2"

echo "[3/3] Signing out the aliabouali2005@gmail.com session created via magic link..."
RT=$(python -c "import json,os; print(json.load(open(os.environ['TEMP']+'/coregym_session.json'))['refresh_token'])" 2>/dev/null || echo "")
if [ -n "$RT" ]; then
  curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X POST \
    "$URL/auth/v1/admin/logout" \
    -H "$H1" -H "$H2" -H "Content-Type: application/json" \
    -d "{\"refresh_token\":\"$RT\"}"
else
  echo "  session file not found — skipping (session also dies when its refresh token is revoked or expires)"
fi

echo "DONE. Verify:"
curl -s "$URL/rest/v1/subscription_plans?select=id,name" -H "$H1" -H "$H2"
echo
curl -s -o /dev/null -w "coach@coregym.com profile lookup HTTP: %{http_code}\n" \
  "$URL/rest/v1/profiles?id=eq.35724bae-6e3e-4c3e-823f-2f1642b2a73e&select=id" -H "$H1" -H "$H2"
