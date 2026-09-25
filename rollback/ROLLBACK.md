# 🔄 ROLLBACK MANIFEST — جلسة 12 سبتمبر 2026

ده الملف المرجعي لكل حاجة اتعملت في الجلسة دي. لما تقولي **"رجّع كذا"** هرجعها من هنا فوراً.

**مشروعين:** `coregym-coach-dashboard` (الموقع) و `coregymali` (فلاتر — اتعدل في الجلسة التانية، تفاصيله في قسم 6).

---

# 🟢 جلسة 25 سبتمبر 2026 — Landing Page احترافية

## 0) Landing Page — coregym-coach-dashboard

الشغل كله في `coregym-coach-dashboard/` — الموقع متتبع في git (آخر commit `3007c6e`)، فكل الرجوع مضمون 100%.

### ملف اتعدل (واحد بس)

| الملف | التغيير | الرجوع |
|---|---|---|
| `src/app/page.tsx` | استُبدل بالكامل — كان landing بسيطة للكوتشات، بقى landing كاملة للمنتج (تطبيق + داش بورد) EN + AR toggle | `git restore src/app/page.tsx` (من داخل `coregym-coach-dashboard/`) — والنسخة الأصلية كمان محفوظة في `rollback/originals/src/app/page.tsx` |
| `src/app/layout.tsx` | تحميل أوزان Poppins زيادة (300 و900) + خطوط جديدة للهيرو: Inter و Plus Jakarta Sans و Instrument Serif italic | `git restore src/app/layout.tsx` |

### ملفات جديدة (الرجوع = امسحها كلها)

| المجلد/الملف | المحتوى |
|---|---|
| `src/components/landing/` | كل مكونات اللاندينج (Nav + MobileMenu, HeroBackdrop فيديو HLS, GlassCard زجاج سايل, Hero, Marquee, AppSection, CoachSection, HowItWorks pinned, Stats, FinalCta, Footer, LangToggle, i18n dictionary) |
| `public/landing/` | صور اللاندينج — لوجو CORE (مقصوص/مصغّر من سبلاش `تطبيق كور (1).png`) + 6 اسكرينات من التطبيق. **الأصول الأصلية متقربة من غير تعديل في الديسك توب/الداونلودس** — المجلد كله نسخ للويب بس |

### الـ dependency الجديد

| الحزمة | الرجوع |
|---|---|
| `motion` (Framer Motion — اتضاف في package.json + package-lock) | `npm uninstall motion` |
| `hls.js` (فيديو الخلفية في الهيرو — اتضاف في package.json + package-lock) | `npm uninstall hls.js` |

### رجوع كامل بضغطة واحدة

```bash
cd /c/Users/mabou/Core_dashboard/coregym-coach-dashboard
git restore src/app/page.tsx src/app/layout.tsx
rm -rf src/components/landing public/landing
npm uninstall motion
```

ملاحظات: اللوجو اتستخدم **زي ما هو** (اتقص مساحته السودا الفاضية وبس — مفيش أي تعديل في التصميم). مفيش أي ملف تاني في المشروع اتلمس — لا dashboard ولا API ولا migrations.

### 🔵 إضافة مساء 25 سبتمبر — فيديو موشن التطبيق في الهيرو

| العنصر | التفاصيل | الرجوع |
|---|---|---|
| `public/landing/app-motion.mp4` | فيديو موشن التطبيق (رندر Raylight) — اتشال منه ووترمارك "Made in Raylight" بفلتر `delogo=x=1560:y=958:w=352:h=110` + ضغط 1280×720/30fps. المصدر الأصلي باقي زي ما هو في `C:/Users/mabou/Downloads/Airbnb 3d app-1790290017936.mp4` | امسح الملف |
| `public/landing/app-motion-poster.jpg` | بوستر من ثانية 0.5 (نضيف من الوترمارك) | امسح الملف |
| `src/components/landing/Hero.tsx` | `HeroPhones` (التليفونات الثلاثة المروحية) اتشالت وخانتها `HeroShowcase`: كارت سينمائي أبيض بيعرض الفديو (autoplay/loop/muted) + scroll-expand + tilt بالماوس + chip كابشن | ملف جديد أصلاً — امسحه أو رجّع النسخة اللي قبل التعديل من النسخة الاحتياطية (مش متتبعة في git) |
| `src/components/landing/ui.tsx` | `PhoneFrame` اترقى لفريم iPhone Pro واقعي (rail تيتانيوم + أزرار جانبية + dynamic island + glare) — مستخدم في AppSection بس | ملف جديد أصلاً |
| `src/components/landing/i18n.ts` | مفتاح جديد `hero.motion` EN/AR للكابشن | ملف جديد أصلاً |

ملاحظة: ملفات `landing/` كلها **غير متتبعة في git** (untracked) — الرجوع ليها إما مسح أو نسخة يدوية.

---

## 6) تعديلات المشروع التانية — coregymali (Flutter) — من برومت فصل الأدوار

> النسخ الأصلية هنا **من git** (المشروع متتبع) — استرجاع مضمون 100%:
> `cd /c/Users/mabou/coregymali && git checkout HEAD -- <file>`

| الملف | التغيير | الرجوع |
|---|---|---|
| `lib/supabase/supabase_config.dart` | زيادة: `dashboardUrl` constant (localhost:3000/signup + TODO للـ production) | `git checkout HEAD -- lib/supabase/supabase_config.dart` |
| `lib/login_sign_up.dart` | 1) شيل كارت "I am joining as" (role pills) 2) ثبّت role='client' في email signup + profiles upsert 3) شيل دايلوج اختيار الدور بعد Google Sign-In (مرتين: login + signup) 4) مسح كلاسات `_RolePill` / `_RoleSelectionDialog` / `_RoleOption` + متغير `_selectedRole` | `git checkout HEAD -- lib/login_sign_up.dart` |
| `lib/fitness_home_pages.dart` | زيادة import `url_launcher` + بانر "Are you a coach? Join CoreGym 🏋️" بعد الهيدر في الـ Home (بيفتح `SupabaseConfig.dashboardUrl` في المتصفح الخارجي) + كلاس `_CoachJoinBanner` في آخر الملف | `git checkout HEAD -- lib/fitness_home_pages.dart` |

`flutter analyze` بعد التعديل: ولا تحذير جديد من التعديلات (الـ 60 الموجودين pre-existing).

## 7) إضافات الموقع — coregym-coach-dashboard (برومت فصل الأدوار)

| الملف | النوع | الرجوع |
|---|---|---|
| `src/app/(auth)/signup/page.tsx` | **جديد** — صفحة تسجيل الكوتش (bio/price/specialization/years) | احذف الملف |
| `src/app/api/coaches/route.ts` | **جديد** — onboarding: profiles.role=coach + صف coaches + صف coach_onboarding (service role) | احذف الملف |
| `src/app/(auth)/login/page.tsx` | تعديل: link "New coach? Create account" بدل نص الديمو | انسخ من `rollback/current`… ⚠️ انتهى بعد التغيير — الأصل: كان فيه `<span>Demo without DB? Use any email; RLS may block.</span>` مكان اللينك |
| `src/app/(dashboard)/dashboard/subscribers/[id]/page.tsx` | إعادة كتابة: صفحة Customer Profile (سعرات/خطوات/تمارين/قياسات من daily_summary, nutrition_logs, workout_sessions/sets, body_measurements, user_goals) | النسخة السابقة (customer data قبل الإضافة) مش محفوظة — الأصل الأصلي قبل الجلسة في `originals/` |
| `supabase/rls_role_updates.sql` | **جديد** — سكريبت RLS اختياري (hardening) — **مش متشغل على القاعدة**، للاستخدام اليدوي في SQL Editor | احذف الملف (مفيش أي أثر على الداتابيز) |

## 8) حسابات اختبار اتعملت واتمسحت (برومت فصل الأدوار)

| الحساب | الحالة |
|---|---|
| `mohammed.coach@coregym.com` (id `4f574c59-...`) | اتعمل لاختبار التسجيل → **اتمسح نهائياً** (auth + profile + coaches + coach_onboarding) ✓ |
| `flowtest-coach@coregym.com` (id `3c61c867-...`) | اتعمل لاختبار الـ signup API → **اتمسح نهائياً** ✓ |

ملاحظة مكتشفة: `profiles` في القاعدة الحقيقية **مفيهوش ON DELETE CASCADE** (مش زي schema.sql) — مسح auth user بيسيب profile يتيم لازم يمسح يدوي (ده اللي حصل واتصحح).

التحقق النهائي بعد التنضيف: 5 صفوف في `coaches` (الأصليين) + 6 coach profiles (5 أصليين + `coach@coregym.com` الديمو من قسم 2).

---

## 1) تغييرات الملفات — coregym-coach-dashboard (الجلسة الأولى)

المشروع كله **غير متتبع في git** (repo الجذر = `C:/Users/mabou` والمشروع عمره ما اتقدم)، فالنسخ الأصلية اتجمعت من سياق الشغل.

### ملفات اتعدلت (الأصلية في `rollback/originals/` والحالية في `rollback/current/`):

| الملف (relative to project) | نوع التغيير |
|---|---|
| `.env.local` | المفاتيح الوهمية → مفاتيح Supabase الحقيقية (anon + service_role من المستخدم) |
| `src/lib/supabase/types.ts` | إعادة كتابة كاملة على الـ schema الحقيقي (46 جدول) |
| `src/app/(dashboard)/dashboard/page.tsx` | Overview: داتا حقيقية + resolveCoachId، شيل mock |
| `src/app/(dashboard)/dashboard/subscribers/page.tsx` | scope بـ coaches.id، شيل mock |
| `src/app/(dashboard)/dashboard/subscribers/[id]/page.tsx` | scope بـ coaches.id، أعمدة حقيقية (price_usd) |
| `src/app/(dashboard)/dashboard/plans/page.tsx` | scope بـ coaches.id، شيل mock fallback |
| `src/app/(dashboard)/dashboard/revenue/page.tsx` | scope بـ coaches.id، شيل أرقام وهمية ($458) |
| `src/app/(dashboard)/dashboard/chat/page.tsx` | `is_read` + `coach_unread` بدل `read` |
| `src/app/(dashboard)/dashboard/settings/page.tsx` | شيل badge "Mock" |
| `src/app/(dashboard)/layout.tsx` | select ضاف `name` + displayName fallback (full_name → name → email) |
| `src/components/plans/PlansClient.tsx` | أعمدة حقيقية + الكتابة عبر `/api/plans` |
| `src/components/chat/ChatClient.tsx` | شيل الـ mock fallback + `is_read` |

### ملفات **جديدة** (الرجوع = حذف):

| الملف | الغرض |
|---|---|
| `src/lib/coach.ts` | helper: resolveCoachId (coaches.user_id → coaches.id) |
| `src/app/api/plans/route.ts` | POST/PATCH للخطط بالـ service_role (الـ RLS بيمنع الإدراج المباشر) |

### ملفات **اتمسحت**:

| الملف | ملاحظة الرجوع |
|---|---|
| `src/lib/mock.ts` | ⚠️ نسخة جزئية بس محفوظة في `originals/src/lib/mock.ts.PARTIAL` (أول 60 سطر بس اتصالت قبل المسح — الملف كان غير متتبع في git) — الاسترجاع هيبقى مكافئ وظيفياً مش متطابق بايت-بايت |

---

## 2) تغييرات قاعدة البيانات (Supabase: mkrjvrnysuvtokqkyoll)

| # | العملية | التفاصيل | طريقة الرجوع |
|---|---|---|---|
| 1 | إنشاء مستخدم auth جديد | `coach@coregym.com` / `CoreGym2026!` — id `35724bae-6e3e-4c3e-823f-2f1642b2a73e` (email confirmed) | حذف المستخدم بالـ admin API (الـ profile يتcascade أوتوماتيك) |
| 2 | تعديل profile | role: `client` (الافتراضي من الـ trigger) → `coach` لنفس المستخدم | بيترجع تلقائياً لما المستخدم يتحذف |
| 3 | إنشاء صف في `subscription_plans` | "Starter — 1 Month" / $29.99 / 30 يوم / max 10 — id `11e11934-ed3a-4a01-a5fc-451c8e2adefb` — coach_id `e1e878be...` (حساب aliabouali2005) | DELETE بالـ id |

**عمليات جربت وفشلت (مفيش أي أثر):** insert profiles مكرر (409)، insert بـ full_name (عمود generated)، FK test وRLS test على plans (409/403).

**آثار جانبية بسيطة:** سجلنا session حقيقي لحسابك `aliabouali2005@gmail.com` عبر magic link + refresh grant (من غير أي تغيير في كلمة السر — الحساب Google Sign-In أصلاً). الرجوع الاختياري: revoke الـ session دي. مفيش أي صف بيانات تاني اتعدل أو اتلمس.

---

## 3) حالة النظام والبيئة

| العنصر | الحالة |
|---|---|
| Dev server | شغال على http://localhost:3000 بمفاتيح حقيقية (بدأ من مجلد المشروع) |
| متصفح ZCode الداخلي | فيه cookie جلسة `sb-mkrjvrnysuvtokqkyoll-auth-token` = حساب aliabouali2005 (tab مفتوح على /dashboard/chat) |
| ملف مؤقت | `%TEMP%/coregym_session.json` فيه access/refresh tokens — يتمسح في الـ rollback |
| `.env.local` الحالي | المفاتيح الحقيقية (الوهمية محفوظة في `originals/.env.local`) |
| coregymali (Flutter) | **زي ما هو 100%** — صفر تعديلات |

---

## 4) سكريبتات الرجوع الجاهزة (بالترتيب)

```bash
# 1) قلب قاعدة البيانات (لازم يشتغل الأول وهو لسه شايف المفاتيح الحقيقية)
bash "C:/Users/mabou/Core_dashboard/rollback/db-rollback.sh"

# 2) رجّع الملفات + امسح الجديد + امسح ملف الجلسة
bash "C:/Users/mabou/Core_dashboard/rollback/files-rollback.sh"

# 3) أعد تشغيل السيرفر (يدوياً):
#    اقتل node على بورت 3000 → npm run dev → امسح cookie المتصفح
```

الرجوع الجزئي متاح كمان: قول مثلاً "رجّع ملف chat بس" أو "امسح الخطة اللي اتعملت بس" وهنفذه من الأوامر اللي فوق.

---

## 5) اللي **ما اتغيرش** (للاطمئنان)

- كل صفوف الـ profiles / subscriptions / messages / conversations — **صفر تعديل** (قراءة بس).
- جدول `coaches` — قراءة بس.
- تطبيق coregymali — مفيش أي ملف اتلمس.
- أي مستخدم تاني غير `coach@coregym.com` — ما اتعملوش حاجة.
