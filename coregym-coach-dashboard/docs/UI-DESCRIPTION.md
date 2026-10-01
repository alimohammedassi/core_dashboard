# CoreGym Coach Dashboard — Full UI Description

Last updated: 2026-09-30. Companion to `docs/PROJECT_SUMMARY.md` (feature/data layer) —
this document describes **what the user sees and interacts with**.

---

## 1. What this UI is

The **CoreGym Coach Dashboard** is the web side of the CoreGym product. A coach
signs in, manages their business (clients, revenue, plans), and runs the full
coaching loop: building reusable **workout templates**, grouping them into
**weekly Programs**, building **Nutrition / meal plans** from a food library,
assigning everything to active subscribers, chatting with them in real time, and
reviewing performance (target-vs-actual sets, volume, adherence, personal
records). Clients train in the CoreGym Flutter mobile app against the same
Supabase database — the dashboard is read/write coach-side only.

There is also a **public marketing landing page** for the whole product
(coach dashboard + client app), legal pages, and a coach-only auth flow.

- **Stack**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript ·
  Tailwind CSS 4 · shadcn-style components on **@base-ui/react** · Recharts 3 ·
  Sonner toasts · next-themes · motion (landing only) · Supabase (data, auth,
  realtime, storage) · Stripe (revenue) · Vercel.
- **State model**: server components query Supabase directly (with
  `resolveCoachId` ownership); client components hold plain `useState` +
  `fetch` mutations. No react-query/zustand/SWR. No polling anywhere — chat is
  a persistent Supabase Realtime channel.

---

## 2. Design system — "Graphite & Soft Volt v2.1"

A dark-first, graphite-gray surfaces + soft-lime accent system. Tokens live in
`src/app/globals.css` (Tailwind v4 `@theme` + `.dark` / `:root` blocks).

### 2.1 Color tokens (exact values)

| Token | Dark (default) | Light |
|---|---|---|
| `--background` | `#121310` | `#fafafa` |
| `--foreground` | `#eceee2` | `#1a1a1a` |
| `--card` | `#171814` | `#ffffff` |
| `--popover` | `#171814` | `#ffffff` |
| `--primary` (soft volt lime) | `#b2d742` | `#506b1a` |
| `--primary-foreground` | `#161806` | `#ffffff` |
| `--secondary` | `#1f201b` | `#f1f1ef` |
| `--muted` / `--muted-foreground` | `#1b1c17` / `#a9ada0` | `#f1f1ef` / `#6b6b6b` |
| `--accent` | `#252620` | `#f0f0ec` |
| `--destructive` | `#ee7f60` | `#b84a30` |
| `--border` / `--input` | `#2c2d27` | `#e8e8e8` |
| `--ring` | `#b2d742` | `#506b1a` |
| `--sidebar` | `#151612` | `#f5f5f2` |

- **Chart palette** (both modes): `#f5a623`, `#ea7a72`, `#e8c468`, `#36b37e`, `#4fd1c5`.
- **Data accents** (for data-viz emphasis, indicators, status — never large fills):
  dark `volt #d1fc00`, `teal #4fd1c5`, `gold #e8c468`, `warning #f59e0b`;
  muscle-map colors `chest #ea7a72`, `arms #54c7be`, `legs #7e71e0`, `core #e87fa2`
  (light-mode variants exist for contrast on white).
- **Radius**: base `0.715rem` with a proportional scale (`sm` 0.6× … `4xl` 2.6×) —
  the whole UI reads as softly rounded cards.
- **Dark/light**: `next-themes`, `attribute="class"`, `defaultTheme="dark"`,
  system-following disabled. The `ThemeToggle` (sun/moon, CSS-picked icons — no
  hydration flash) flips modes; light is fully supported, dark is the default.
- **Toaster**: Sonner mounted once in the root layout with `richColors`,
  theme-aware, lucide icons, popover/border tokens.

### 2.2 Typography

- **Poppins** (weights 300–900, Latin) — the UI font for English, wired to
  `--font-sans` and `--font-heading`.
- **Cairo** (variable, Arabic+Latin) — swapped in via
  `html[lang="ar"] { font-family: var(--font-cairo), … }` since Poppins has no
  Arabic glyphs.
- **Inter** — used only by the landing navbar.
- Arabic uses Egyptian colloquial register with **Latin digits**
  (`ar-EG-u-nu-latn` Intl locale).

### 2.3 Motion & feedback

- Landing page: `motion` (Framer Motion successor) — scroll-scrubbed pinned
  steps, 3D mouse tilt on the phone mockup, staggered reveals, cursor-following
  glow cards, animated counters; every usage respects `useReducedMotion`.
- Dashboard chrome: CSS only — `tw-animate-css` utilities and a **global
  3px route-progress bar** (indeterminate sweep, 150ms show-delay, RTL-reversed,
  `prefers-reduced-motion`-aware) triggered by every `GlobalLink` via
  `useLinkStatus()`.
- Loading UX: per-route `loading.tsx` **skeletons matching each page's layout**
  (13 of them), plus a `LoadingOverlay` primitive with a 300ms delay so fast
  loads never flash a spinner.
- Mutations report with Sonner toasts (`toast.success/error`) almost everywhere.

---

## 3. App shell & navigation

### 3.1 Root layout (`src/app/layout.tsx`)

`I18nProvider` → `ThemeProvider` → children + `<Toaster richColors />`.
`<html lang dir>` is rendered **server-side from a cookie** so RTL/Arabic is
correct on first paint (no RTL flash). Metadata: "CoreGym Coach Dashboard".

### 3.2 Dashboard shell (`src/app/(dashboard)/layout.tsx`)

A server component that gates every dashboard route: unauthenticated →
`/login`; incomplete onboarding → `/onboarding`; non-coach roles get a
fail-closed "Access denied" panel with sign-out.

- **Desktop (≥ md)**: a 256px fixed sidebar (`bg-sidebar`, `border-r`):
  - **Brand row**: lime rounded square with a `Dumbbell` icon + "CoreGym" + "Coach".
  - **Nav** (9 items, fixed order): Overview (`LayoutDashboard`), Workouts
    (`ClipboardList`), Programs (`CalendarDays`), Nutrition (`Apple`), Chat
    (`MessageSquare`), Subscribers (`Users`), Plans (`CreditCard`), Revenue
    (`CreditCard`), Settings (`Settings`).
  - **Active state**: lime-tint background (`bg-primary/10`), semibold text,
    and a **2px lime vertical indicator bar** at the inline start edge; icons
    turn lime. `/dashboard` matches exactly; other items match by prefix.
  - **Footer row**: avatar with initials fallback, display name + email,
    `LangToggle` (Languages icon, "ع"/"EN" label), `ThemeToggle` (sun/moon),
    and a sign-out form button (`LogOut` icon).
- **Mobile (< md)**: no drawer — a `h-14` top bar with the brand and a
  **horizontally scrollable text-link nav row** (compact `topbar` variant of the
  same `SidebarNav`). Content area is `bg-muted/20` padding.

### 3.3 i18n & RTL (`src/lib/i18n/`)

- Languages: **English (default)** and **Arabic**, stored in cookie
  `coregym-lang`; server reads it for SSR, `LangToggle` sets state + cookie +
  `<html lang/dir>` immediately and calls `router.refresh()`.
- `dir="rtl"` for Arabic; components use logical utilities (`ms-`, `start-`,
  `rtl:rotate-180` on pager chevrons).
- Dictionaries are 12 domain files (`common`, `auth`, `overview`, `subscribers`,
  `workouts`, `programs`, `nutrition`, `plans`, `revenue`, `settings`, `chat`,
  `misc`) with dot-path `t(key, {vars})`, `{var}` interpolation, English
  fallback for missing Arabic keys, and **en/ar parity enforced by a unit test**
  (`tests/i18n-parity.test.ts`).
- The landing page has its **own** EN/AR copy persisted in localStorage
  (independent of the dashboard cookie).

---

## 4. Public pages

### 4.1 Landing (`/` → `src/components/landing/`)

A dark (`#0a0b08`) animated marketing page for the whole product, with its own
EN/AR toggle and RTL flip. Sections in order:

1. **Navbar** — scroll-shrinking blur header (Inter), full-screen mobile menu,
   EN/ع pill toggle with a spring `layoutId`, Login link.
2. **Hero** — headline "Train with a plan. / Track every detail. / Make real
   progress."; CTAs "I'm a coach — get started" and "I'm training — get the
   app"; an auto-playing muted looping app video in a white card that scales in
   on scroll and tilts in 3D with the mouse; live-caption chip with pinging dot.
3. **Marquee** — infinite 38s CSS loop of feature words, mask-faded, pauses on
   hover.
4. **AppSection ("For clients")** — bento grid of app-feature cards: flagship
   "log a meal" card with AI Scan / Suggest / Voice / Barcode capability chips,
   streak/rank card, AI kitchen card; hover lift + colored glow borders.
5. **CoachSection ("For coaches")** — dashboard mockup beside a feature
   checklist and a "Create your coach account" CTA to `/signup`.
6. **HowItWorks** — desktop: pinned scroll-scrubbed step track with a progress
   line; mobile/reduced-motion: stacked numbered cards.
7. **Stats** — four in-view animated counters.
8. **FinalCta** — gradient CTA card (app + coach buttons), then **Footer**
   (logo, tagline, login/signup/privacy/terms).
- Supporting kit: `Grain` SVG noise overlay, `Glow`, `Reveal`/`Stagger`,
  `Counter`, `GlowCard`, `PhoneMockup` (metallic rail, dynamic island, glare
  sweep, spring 3D tilt), `hls.js` for the hero video stream.

### 4.2 Legal (`/privacy`, `/terms`)

Server-rendered shared `LegalPage` with inline EN/AR content — Privacy Policy
(11 sections, effective 2026-09-28, discloses Gemini AI analysis) and Terms of
Service (10 sections, effective 2026-09-26).

---

## 5. Auth flow (`(auth)` route group — bare passthrough layout)

- **`/login`** ("use client") — centered card (max-w-sm) on `bg-muted/30`.
  Title "CoreGym Coach Login" / "CoreGym — دخول الكوتش"; Email + Password
  fields, "Forgot password?" link, "Sign in"; divider then **"Continue with
  Google"** (rendered only when Supabase reports Google OAuth enabled);
  handles `?error=oauth_cancelled|not_coach|…` toasts. Post-login verifies
  `profiles.role === "coach"` — non-coaches are signed out with an
  "Access denied" toast. Footer: back-to-home and create-account links.
- **`/signup`** — "Join CoreGym as a Coach": display name, email, password
  (min 6), specialization toggle chips (Weight Loss, Muscle Gain, CrossFit,
  Boxing, Nutrition, Yoga, Running, Calisthenics), monthly price USD
  (default 300), years of experience, bio. Creates the Supabase user then the
  `coaches` row; clients sign up in the mobile app only.
- **`/forgot-password`** — email-only form; "Send verification code" issues a
  Supabase OTP and navigates to `/reset-password?email=…` (generic success to
  prevent user enumeration).
- **`/reset-password`** — two stages: 8-digit code entry (verify + resend with
  a 60s cooldown countdown) → new + confirm password (policy hint: ≥8 chars,
  upper + lower + digit); revokes other sessions, redirects to `/login`.
- **`/onboarding`** — a **5-step coach profile wizard** with a segmented
  progress bar ("Step n of 5"): 1 Basics (full name, avatar upload, read-only
  email, bio) → 2 Professional (specialty chips + custom, years of experience)
  → 3 Achievements upload → 4 Certificates upload → 5 Review + "Complete
  profile". Guards: unauthenticated → `/login`; already complete → `/dashboard`.
- **`/auth/callback`** (route handler) — exchanges the OAuth code, heals legacy
  Google coaches, and routes by footprint: complete coach → `/dashboard`;
  incomplete → `/onboarding`; client-footprint account →
  `/login?error=not_coach`; brand-new user → `/onboarding`.

---

## 6. Dashboard pages

### 6.1 Overview — `/dashboard`

Server component; a `RangeSelector` (Select in the title row) drives everything
via `?range=` (30d / month / 90d) with a resolved-window caption like
"Aug 16 – Sep 15 · Last 30 days".

- **4 KPI cards**: Active clients, Net revenue (gross noted), Unread messages
  (marked "realtime"), Workouts in range — each with a trend icon and
  "vs. N last period".
- **Today strip**: check-ins, meals logged, active programs.
- **Charts**: `OverviewAreaChart` (gradient area — revenue or new-subscribers
  mode), `AdherenceGauge` (custom SVG semicircular arc with lime gradient and a
  centered %), `WeekdayBarChart` (Mon–Sun workouts, peak day in lime), and a
  subscriber-status breakdown (Active/Trial/Cancelled + total).
- **Top clients table** with an "Export CSV" button (downloads
  `/api/export/subscribers`).
- All charts have localized empty states and localized weekday labels.

### 6.2 Workouts — `/dashboard/workouts`

The reusable **workout template library** (paginated server fetch + client
grid, `Pager`). Subtitle: "Build once, assign to any active client, then
review their performance."

- **Template cards** (2–3 columns): name, muscle `Badge`s (color-coded via
  muscle-map tokens), exercise count, "updated" date, and a footer of
  Edit / Duplicate / Assign / Program / Delete actions (delete confirms with
  `window.confirm` and removes optimistically; server refuses with 409 while
  assignments reference the template).
- **Empty state**: centered Layers icon + create-CTA card.
- **`TemplateBuilder` dialog** (create/edit): name; target-muscle toggle chips
  (10 presets + custom add); notes; **exercise rows** — each row has a numbered
  badge, an exercise-name input with **autocomplete over the real exercises
  catalog** (free text allowed), up/down **order arrows** (disabled at the
  ends), delete, and sets/reps/weight(kg)/rest(sec) number inputs + a row note.
  Validation (one toast per problem): name required, ≥1 exercise, sets a
  positive number, reps > 0 when present, weight/rest ≥ 0. Saves atomically via
  `POST/PATCH /api/workout-templates` (SECURITY DEFINER RPC under the hood).
- **`AssignDialog`** — two modes from one dialog: **assign** (client select,
  date input defaulting to **tomorrow**, optional program link) and
  **program** (adds the session to the client's active app program — fetches
  `/api/client-active-program` on client change, shows the program name or a
  destructive "no active program" state with submit disabled). Validation
  toasts for missing client/date/program.
- Shows a "Coach profile missing" card if the coach row doesn't exist.

### 6.3 Programs — `/dashboard/programs`

Groups templates into a **coach-owned weekly pattern** and enrolls clients;
all daily assignments for the whole duration are generated up front.

- **Program cards**: name + per-day badges ("Mon · Push Day", or a "no days"
  badge), with Edit / Enroll / Delete (delete refused while enrollments exist).
- **`ProgramBuilder` dialog**: a Mon–Sun row of selects — Rest (empty) or one
  of the coach's own templates per weekday.
- **`EnrollDialog`**: client select, start date (defaults to **next Monday**),
  fixed duration in weeks, and a **live "N workouts will be generated"
  preview** computed by the same date math as the database (unit-tested in
  `src/lib/program-dates.ts`). On HTTP 409 (client already enrolled) offers a
  confirm to replace the existing active enrollment.
- Validation: name required, ≥1 training day, client/start/duration required.

### 6.4 Nutrition — `/dashboard/nutrition`

Weekly **meal-plan programs** built from the shared food library
(paginated + `Pager`).

- **Program cards**: localized 7-weekday badges each showing meal counts;
  Edit / Duplicate / Delete icon buttons and an "assign to client" button
  (disabled with explanatory copy when there are no subscribers). Empty state:
  Apple icon + CTA.
- **Builder dialog** (inside `NutritionClient`, 822 lines) — a 3-level
  hierarchy: **weekday tabs** (clicking an inactive day lazily creates it; a
  "rest day" button removes the day) → **meals** (inline rename, up/down
  reorder, remove, live per-meal macro totals) → **foods** (added via a nested
  **`FoodPicker` search dialog** with 300ms-debounced `/api/foods/search`;
  quantity in the food's own serving unit with **live scaled kcal/macro
  totals** via `lib/nutrition-math`; remove). Day headers show day totals; a
  footer bar shows week totals. Save POSTs/PATCHes
  `/api/nutrition-programs` and optimistically renders the card.
- **Enroll dialog**: client select, start date (today), weeks 1–52, live
  "N meals will be created" preview; success toast reports the server's
  `meals_generated` count.

### 6.5 Chat — `/dashboard/chat`

Full parity with the mobile app's media messaging
(`messages.type: text | voice | image | file`).

- **Layout**: a 340px conversation list (avatar with initials, name, unread
  count `Badge`, localized last-message preview line via `messagePreview()`,
  date) beside the **thread pane** (header with client avatar + "realtime"
  caption).
- **Bubbles**: own messages `bg-primary` right-aligned
  (`rounded-2xl rounded-ee-sm`), theirs `bg-muted` left; timestamp + a
  localized "unread" tag under each bubble; spinner while the first page
  loads; **"load older" button** with keyset pagination (50/page, scroll
  position anchored).
- **Media**: `MediaMessage` renders image thumbnails opening a custom
  **fullscreen lightbox** (`bg-black/80`, click-to-close), inline **voice
  players** with duration, and **file cards** with name/size/download. Buckets
  are private — signed URLs (15-min TTL) are minted by
  `POST /api/chat/attachments` after a participant check; failures refetch once
  then degrade to an "Attachment unavailable" chip.
- **Composer**: text input, image and file pickers (single pending attachment
  shown as a removable chip with size), and a **`VoiceRecorder`**
  (MediaRecorder: mic button → pulsing red dot + m:ss timer + trash/stop →
  preview with local playback → discard/send; prefers `audio/mp4` for iOS
  parity, falls back to webm/opus; mic-denied toast). The send button doubles
  as the attachment sender with a spinner.
- **Realtime**: a single Supabase Realtime channel `coach:{coachId}:messages`
  created once per session — INSERT on `messages` (append + bump conversation
  to top + auto-mark-read if open), UPDATE on `messages` (read receipts), and
  UPDATE on `conversations` (unread badge sync). Opening a thread optimistically
  zeroes the badge and marks messages read (one retry + rollback on failure).
  **No polling anywhere in the app.**

### 6.6 Subscribers — `/dashboard/subscribers`

- **List**: status filter chips as links (`?status=` — All / active /
  cancelled / past_due / trialing / expired / paused; active chip rendered as
  the filled Button variant) above a card-wrapped **table**: avatar + name +
  email, plan, `StatusBadge` (active=default lime, cancelled/expired=
  destructive, else secondary), start date, View link. Footer:
  "Showing X–Y of Z" + prev/next pager (chevrons `rtl:rotate-180`), 25/page.
- **Client profile** — `/dashboard/subscribers/[id]` (server component,
  ~1018 lines, the app's richest page; `notFound()` on non-owned ids):
  1. **`AiAnalysisCard`** — on-demand Gemini analysis: idle hint → Analyze
     (spinner) → structured read-only result (overall assessment, workout and
     nutrition sections with observations/weaknesses/ideas, conflicts, issues
     with evidence, improvements with target badges, prioritized coach action
     items) + disclaimer + "run fresh"; localized error panel per HTTP status
     with Retry.
  2. **Identity & subscription card** — avatar, plan, price, start/end, status badge.
  3. **Progress card** — stat tiles vs goals (latest weight + delta + target,
     today's calories/steps, workouts this week), active program week n/N,
     latest PR, and weekly volume as **pure-CSS mini bars**.
  4. **Assigned nutrition plan card** — enrollment badges with adherence %,
     today's meals with client swaps shown as strikethrough + "Swapped"/
     "Adjusted" badges and the original prescription in a `<details>` block,
     `RegenerateNutritionButton`.
  5. **Nutrition today** — kcal/P/C/F vs goal + recent meals + collapsible full
     history table.
  6. **Workout performance** (`ExerciseResults`) and **`NutritionTrends`**
     charts (see §7).
  7. **Collapsible sections** (`CollapsibleSection` — full-header toggle with
     rotating chevron and a one-line collapsed summary): Sessions, Assigned
     workouts (Upcoming / In progress / Completed / Skipped with Review links),
     Programs (enrollments with status badges, `EnrollmentActions`
     Pause/Resume/Remove, "Open progress"), Daily summary table
     (kcal/protein/steps/water/sleep/workout), Body measurements table.
- **Workout performance review** —
  `/dashboard/subscribers/[id]/workouts/[assignmentId]`: header card (template
  name, status badge, scheduled/completed dates, duration, muscles); if the
  mobile app hasn't linked a session, an explicit **"No session yet"** empty
  card; otherwise KPI tiles (sets completed x/y, total volume kg, duration),
  per-exercise cards with a target line ("sets × reps @ kg") above the **actual
  set table** (weight with a "Best" badge, reps, volume, rest), warmup sets
  listed separately, a client note card, **PR cards**, and side by side:
  **`FeedbackBox`** (textarea → posts into the client's chat conversation) and
  **`NextWorkoutEditor`** ("duplicate as next workout": rows pre-seeded from
  actual performance — weight suggested as the client's best achieved lift —
  with per-row target-vs-actual reference, name defaulted to "… — next", date
  to tomorrow; saving creates a *derived* template + new assignment, originals
  untouched).
- **Program enrollment progress** —
  `/dashboard/subscribers/[id]/programs/[enrollmentId]`: header (program,
  status, start, weeks, completed/total, training days); a **weeks × days
  grid** where each cell is that week's occurrence as a status badge
  (completed = filled, assigned = outline, else secondary) linking to the
  workout review; weekly volume bars (tonnes); an **"Update Remaining Weeks"**
  card whose `RegenerateButton` confirms exactly what will be replaced and is
  enabled only while the enrollment is active and has future assigned rows.
- **Nutrition plan detail** —
  `/dashboard/subscribers/[id]/nutrition/[enrollmentId]`: header with overall
  adherence (incl. skipped); a **weeks × 7-days grid of kcal badges**
  anchor-jumping to day cards; day-by-day meal cards with prescribed-vs-current
  macros per meal and per-food rows (original prescription in `<details>` when
  the client swapped/adjusted); `NutritionTrends`; "Update Remaining Days" with
  `RegenerateNutritionButton`.

### 6.7 Plans — `/dashboard/plans`

Subscription plan library (paginated): plan cards with formatted price
(`fmt.money`), "per N days", optional max-clients line, plan id in mono font;
one create/edit dialog (name; price ≥ 0 required; duration_days min 1 default
30; optional max_clients min 1) with toast validation, writing via
`/api/plans`. (Coach-side writes go through service role — see the known RLS
note in PROJECT_SUMMARY.)

### 6.8 Revenue — `/dashboard/revenue`

Server component with a live-data badge: **"Live Stripe data"** when
`stripe_account_id` is connected, else "Real data — payment_intents".

- **3 KPI cards**: Gross revenue, Platform commission (real Stripe fees, or a
  15% estimate with a 2000-row guardrail), Net payout.
- **Transactions table** (20 latest: id, client, amount+currency, date, status
  badge) and a **Payouts table** (Stripe API, 10 latest: id, amount, arrival
  date, status).
- Error/db notes render as inline amber/red text. No charts.

### 6.9 Settings — `/dashboard/settings`

A `SettingsShell` client-side section switcher: sticky 240px side nav (six
sections; horizontal scroll on mobile) — only the active section's cards
render.

- **Account** — `AvatarUpload` (image-only, ≤5 MB, cache-busting, remove) +
  name form (maxLength 80, save disabled until changed) + `EmailChange`
  (confirmation flow).
- **Professional** — `CoachProfileForm` (loads `/api/coach/profile`; save
  enabled only on dirty diff; specialization chips + custom; policy fields:
  notice days, refund policy, late fee) + `CredentialsManager` for
  achievements/certificates uploads (XHR with a **real progress bar**, reorder
  up/down arrows, delete, file sizes; reused by onboarding).
- **Notifications** — `NotificationsPrefs` Switch rows (meals/water/calories/
  chat + quiet hours) with **optimistic toggle that rolls back** on a failed
  upsert.
- **Appearance** — `AppearancePrefs` theme pills (next-themes); language and
  density boxes honestly marked "use the sidebar toggle" / unavailable.
- **Security** — `SecurityControls` (password ≥8 + match; revokes other
  sessions; "sign out everywhere" with confirm) and provider-aware password
  controls.
- **Payouts** — Stripe Connect status ("Connected {id}" / "Not connected"),
  Connect/Manage button, and an explainer of `application_fee_amount`,
  `transfer_data.destination`, and the handled webhook events.

---

## 7. Charts & data visualization

All charts are **Recharts 3**, wrapped `dir="ltr"` so they hold orientation
under RTL, with localized empty states.

| Component | Where | What it shows |
|---|---|---|
| `OverviewAreaChart` | Overview | Gradient area chart — net revenue or new subscribers per bucket; money-short Y axis |
| `WeekdayBarChart` | Overview | Mon–Sun workout bars; peak day in lime via `Cell` |
| `AdherenceGauge` | Overview | Custom SVG semicircular arc, lime gradient, centered % |
| `ExerciseResults` | Client profile | Per-session volume bars + top-3 exercise weight-progression multi-line chart with a colored-dot legend |
| `NutritionTrends` | Nutrition detail + client profile | Prescribed-vs-actual calories bars, protein/carbs/fat 3-line chart, weekly adherence-% bars |
| CSS mini-bars | Client profile, program enrollment | Weekly volume (kg/tonnes) without a chart lib |

---

## 8. Cross-cutting states

- **Skeletons**: 13 `loading.tsx` files mirroring each page's real layout
  (KPI row + charts + table for Overview; two-pane skeleton for chat; client
  card grid for subscribers; the profile's localized h1 for the detail page).
- **Empty states**: designed, icon-led, CTA-bearing (Layers + create card for
  workouts; Apple for nutrition; dashed-border variants in chart components;
  "No session yet" on reviews; "session data not available yet" language when
  the mobile app hasn't linked).
- **Errors**: root `error.tsx` ("Something went wrong" + digest + Try again),
  `global-error.tsx` (last-resort static English shell), dashboard-segment
  `error.tsx` ("Couldn't load this section" + Overview link), branded
  `not-found.tsx` ("Back to dashboard").
- **Optimistic UX**: template/plan/nutrition-card upserts update local state;
  chat read-state is optimistic with retry+rollback; notification switches roll
  back on failure; everything else refreshes via `router.refresh()`.
- **Confirmation**: `window.confirm` for destructive actions (delete template,
  replace enrollment on 409, regenerate remaining weeks/days, remove
  enrollment) — each confirm states exactly what will be replaced/kept.

---

## 9. Accessibility & responsiveness

- Semantic landmarks; sidebar nav uses real links; icons carry `aria-label`s
  (toggles, sign-out); the route-progress bar has `role="progressbar"` +
  localized label; collapsibles use `aria-expanded`.
- `prefers-reduced-motion` disables the landing's scroll/tilt choreography and
  the progress sweep.
- Breakpoint behavior: `md` is the shell switch (sidebar ↔ top-bar nav);
  card grids collapse from 3→2→1 columns; settings side-nav scrolls
  horizontally on mobile; the landing swaps its pinned How-It-Works track for
  stacked cards and opens a full-screen mobile menu.
- Keyboard: Escape closes the client search; Enter adds custom muscle/specialty
  chips; dialogs are focus-trapped by the Base UI primitives.

---

## 10. Component inventory (quick reference)

- **Primitives** (`src/components/ui/`): avatar, badge, button, card, dialog,
  dropdown-menu, input, label, loading-overlay, scroll-area, select, separator,
  sheet, skeleton, sonner, spinner, switch, table, tabs, textarea
  (shadcn-style on `@base-ui/react`, not Radix).
- **Shared** (`src/components/shared/`): `GlobalLink` + `RouteProgress`,
  `CollapsibleSection`.
- **Dashboard chrome**: inline in `(dashboard)/layout.tsx` + `SidebarNav`,
  `ThemeToggle`, `LangToggle`, `Pager`. (A legacy `Sidebar.tsx`/`TopBar.tsx`
  pair with `ClientSearch` and `UpgradeCard` exists but is unused.)
- **Feature folders**: `dashboard/overview/` (RangeSelector, OverviewCharts),
  `workouts/` (WorkoutsClient, TemplateBuilder, AssignDialog, NextWorkoutEditor,
  FeedbackBox), `programs/` (ProgramsClient + builder/enroll, RegenerateButton),
  `nutrition/` (NutritionClient + builder/enroll/FoodPicker, NutritionTrends,
  RegenerateNutritionButton), `subscribers/` (AiAnalysisCard, ExerciseResults,
  EnrollmentActions, StatusBadge), `chat/` (ChatClient, MediaMessage,
  VoiceRecorder), `plans/` (PlansClient), `settings/` (SettingsShell,
  SettingsSections, SettingsExtras, CoachProfileForm, CredentialsManager,
  NotificationsPrefs, SecurityControls, SettingsClient), `landing/` (Landing,
  Hero + Navbar + Marquee, AppSection, CoachSection, Closing/HowItWorks/Stats/
  FinalCta/Footer, PhoneMockup, ui kit, i18n).
- **Lib support**: `lib/i18n/*` (config/server/client/translate/dictionary/
  format), `lib/program-dates.ts` (unit-tested generation math),
  `lib/nutrition-math.ts` (per-serving macro scaling),
  `lib/chat-unread.ts`, `lib/pagination.ts` (`LIB_PAGE_SIZE=20`).
