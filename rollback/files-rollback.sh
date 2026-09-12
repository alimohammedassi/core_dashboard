#!/usr/bin/env bash
# ============================================================
# ROLLBACK STEP 2 — Files (run AFTER db-rollback.sh)
# Restores every dashboard file to its pre-session (2026-09-12)
# state and removes files created during the session.
# mock.ts is restored from the PARTIAL capture — see
# originals/src/lib/mock.ts.PARTIAL notes (not byte-identical).
# ============================================================
set -e
BASE="C:/Users/mabou/Core_dashboard"
D="$BASE/coregym-coach-dashboard"
O="$BASE/rollback/originals"

echo "[1/5] Restoring .env.local to placeholder keys..."
cp "$O/.env.local" "$D/.env.local"

echo "[2/5] Restoring modified source files..."
cp "$O/src/lib/supabase/types.ts"                                   "$D/src/lib/supabase/types.ts"
cp "$O/src/app/(dashboard)/dashboard/page.tsx"                      "$D/src/app/(dashboard)/dashboard/page.tsx"
cp "$O/src/app/(dashboard)/dashboard/subscribers/page.tsx"          "$D/src/app/(dashboard)/dashboard/subscribers/page.tsx"
cp "$O/src/app/(dashboard)/dashboard/subscribers/[id]/page.tsx"     "$D/src/app/(dashboard)/dashboard/subscribers/[id]/page.tsx"
cp "$O/src/app/(dashboard)/dashboard/plans/page.tsx"                "$D/src/app/(dashboard)/dashboard/plans/page.tsx"
cp "$O/src/app/(dashboard)/dashboard/revenue/page.tsx"              "$D/src/app/(dashboard)/dashboard/revenue/page.tsx"
cp "$O/src/app/(dashboard)/dashboard/chat/page.tsx"                 "$D/src/app/(dashboard)/dashboard/chat/page.tsx"
cp "$O/src/app/(dashboard)/dashboard/settings/page.tsx"             "$D/src/app/(dashboard)/dashboard/settings/page.tsx"
cp "$O/src/app/(dashboard)/layout.tsx"                              "$D/src/app/(dashboard)/layout.tsx"
cp "$O/src/components/plans/PlansClient.tsx"                        "$D/src/components/plans/PlansClient.tsx"
cp "$O/src/components/chat/ChatClient.tsx"                          "$D/src/components/chat/ChatClient.tsx"

echo "[3/5] Restoring deleted src/lib/mock.ts (PARTIAL — check file header)..."
cp "$O/src/lib/mock.ts.PARTIAL" "$D/src/lib/mock.ts"

echo "[4/5] Removing files created during the session..."
rm -f "$D/src/lib/coach.ts"
rm -rf "$D/src/app/api/plans"

echo "[5/5] Clearing auth session file from temp..."
rm -f "$TEMP/coregym_session.json" /tmp/coregym_session.json 2>/dev/null || true

echo "DONE. Now restart the dev server (it still runs with old env):"
echo '  taskkill //F //IM node.exe   (or kill the specific PID listening on :3000)'
echo '  cd "C:/Users/mabou/Core_dashboard/coregym-coach-dashboard" && npm run dev'
echo "Also clear the sb-mkrjvrnysuvtokqkyoll-auth-token cookie in the browser to log out."
