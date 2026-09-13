# CoreGym — Coach Dashboard

The coach-facing web app for the CoreGym fitness product. Coaches manage their
clients, subscriptions, revenue and chat — and run the complete
**workout management loop**: build reusable workout templates, assign them to
clients, review the client's logged performance set-by-set, send feedback, and
schedule the adjusted next workout. Clients train in the CoreGym Flutter
mobile app against the same Supabase database; this dashboard never writes
mobile-side data and mobile never changes for dashboard features.

> Docs: [`docs/PROJECT_SUMMARY.md`](docs/PROJECT_SUMMARY.md) — full feature and
> status summary · [`docs/coach-weekly-programs.md`](docs/coach-weekly-programs.md)
> — deep dive on the recurring Programs feature.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Styling | Tailwind CSS 4, shadcn/base-ui, "Graphite & Soft Volt" theme (dark default, Poppins/Cairo) |
| Database | Supabase (Postgres + RLS + RPCs) — shared with the mobile app |
| Payments | Stripe (test-mode; Connect onboarding + webhooks) |
| Hosting | Vercel |

## Features

- **Coach dashboard** — overview stats, subscribers (rich client profile),
  plans, revenue, settings, realtime chat reusing the app's conversation tables.
- **Workout Management System** — template library with a full builder
  (target muscles, exercises with sets/reps/weight/rest/order, autocomplete
  from the shared `exercises` catalog), assignment to active subscribers,
  target-vs-actual performance review per set (best weight, volume, completion,
  warmup separation), client notes, weekly volume + personal records, feedback
  via existing chat, and "Duplicate as Next Workout" adjustment.
- **Coach Weekly Programs** — group templates into a weekly schedule
  (Mon/Wed/Fri style), enroll a client for a fixed duration, auto-generate all
  assignments, weeks×days progress grid, and explicit "Update Remaining Weeks"
  regeneration that never touches client history.
- **Theme** — one token system in `globals.css` drives every page, light and
  dark.

## Getting started

Prerequisites: **Node 20+** (24 recommended), npm, a Supabase project with the
CoreGym schema, and Stripe test keys.

```bash
npm install
cp .env.example .env.local   # fill in real values (see table below)
npm run dev                  # http://localhost:3000
```

### Environment variables

`.env.local` is gitignored — never commit real values.
[`.env.example`](.env.example) is the template:

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Public project URL and anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | server API routes only | Bypasses RLS. Used strictly after authentication + coach-ownership checks; never shipped to the browser. |
| `STRIPE_SECRET_KEY` | Connect + revenue | `sk_test_…` for development. |
| `STRIPE_WEBHOOK_SECRET` | `/api/webhooks/stripe` | Placeholder values safely degrade to mock mode. |
| `NEXT_PUBLIC_APP_URL` | Connect redirects | Defaults to `http://localhost:3000`. |

### Database migrations

The app expects schema objects created by two idempotent SQL files in
`supabase/` — run them **in order** in the Supabase SQL Editor (safe to
re-run):

1. `supabase/workout_templates_migration.sql` — workout templates, exercises,
   assignments, the `workout_sessions.assignment_id` mobile link, RLS, and the
   atomic template RPCs.
2. `supabase/coach_programs_migration.sql` — coach programs, program days,
   client enrollments, `enrollment_id`/`week_number` columns, generation and
   regeneration RPCs.

`supabase/schema.sql` and `supabase/rls_role_updates.sql` are proposals/notes
against the live schema — see `docs/PROJECT_SUMMARY.md` before applying
anything from them.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run lint        # eslint
npx tsc --noEmit    # type check
node --test tests/program-dates.test.ts   # date-generation unit tests
```

## How it talks to Supabase

- **Reads** on pages use the authenticated user's client (`@/lib/supabase/server`)
  and rely on RLS.
- **Writes that RLS blocks** (live policies key coach rows by `coaches.id`
  while comparing to `auth.uid()`) go through server API routes that
  authenticate the user, resolve the coach via `resolveCoachId()`, validate
  input and ownership, then write with the service role. RLS is never disabled.
- **Multi-row operations** (template + exercises, enrollment + generated
  assignments, program + days) are atomic via `SECURITY DEFINER` RPCs —
  PostgREST cannot wrap multiple writes in a transaction.
- **Coach identity** is always `coaches.id` resolved from the session, never a
  browser-supplied id.

## Deployment (Vercel)

Connect the repo, set the environment variables from the table above in the
Vercel project, and deploy. Point the Stripe webhook endpoint at
`https://<your-domain>/api/webhooks/stripe` and copy its signing secret into
`STRIPE_WEBHOOK_SECRET`.

## Testing status

Unit tests and the full type/build/lint suite pass; both features were
accepted end-to-end against the live Supabase project (see
`docs/PROJECT_SUMMARY.md` → "Current status" for the detailed pass list and
known issues — including the unapplied `plans_coach_all` RLS fix and the
`stripe_account_id` column-location mismatch flagged there).
