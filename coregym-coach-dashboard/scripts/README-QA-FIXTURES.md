# QA Fixtures — synthetic data system

Tagged synthetic dataset for dashboard QA (directive §7). **Nothing here is a
production secret.** All fixture rows are identifiable and removable.

## Files

| File | Purpose |
|---|---|
| `seed-qa-fixtures.mjs` | Idempotent seeder: wipes the tagged set, then creates 27 `qa.client.NNN@coregym.test` clients, 27 subscriptions, 3 `[QA]` plans, 22 `[QA]` workout templates, 1 `[QA]` weekly program + enrollment + assignments/sessions/sets, 1 `[QA]` nutrition program + enrollment + meal assignments, 10 conversations (unread badges on 2), 10 payment intents. |
| `cleanup-qa-fixtures.mjs` | FK-safe, chunked removal of every tagged row. Keeps the QA coach identity so the seeder can re-run. |
| `.qa-credentials.local.json` | **gitignored.** Fixture credentials (coach email/password + client password template). Rotate freely; never commit. |

## Credentials policy

- Passwords are **not committed** — they live only in the gitignored local
  file (env overrides: `QA_COACH_EMAIL`, `QA_COACH_PASSWORD`, `QA_CLIENT_PASSWORD`).
- Fixture data is namespaced: coach display name `CoreGym QA Coach`, emails
  `qa.client.*@coregym.test` / `loadtest+uiqa@coregym.test`, entity names `[QA] …`.
- To remove the QA coach entirely: run cleanup, then delete the
  `loadtest+uiqa@coregym.test` auth user (cascades its profile) from the
  Supabase dashboard.

## Usage

```bash
node scripts/seed-qa-fixtures.mjs     # create/refresh the tagged dataset
node scripts/cleanup-qa-fixtures.mjs  # remove it (FK-safe, chunked)
node scripts/probe-qa.mjs             # read-only state probe
node scripts/probe-rls.mjs            # read-only RLS behavior probe
```

## Known related blocker

`subscription_plans` RLS reads are blocked for new-style coaches
(`supabase/plans_coach_rls_fix.sql` — prepared, awaiting owner application).
Seeded plans exist but the Plans page will read empty until it is applied.
