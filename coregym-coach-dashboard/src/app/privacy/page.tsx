import type { Metadata } from "next";
import { LegalPage, type LegalContent } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — CoreGym",
  description:
    "How CoreGym collects, uses, stores and deletes your personal data.",
};

const en: LegalContent = {
  title: "Privacy Policy",
  updated: "Effective date: September 28, 2026",
  intro:
    "CoreGym (\"CoreGym\", \"we\", \"us\") operates a mobile fitness application for clients and a web dashboard for coaches. This policy explains what personal data we collect, how we use it, and the choices and rights you have — including how to delete your account and data at any time.",
  sections: [
    {
      heading: "1. Data we collect",
      paragraphs: [
        "We collect only the data needed to provide the service:",
      ],
      list: [
        "Account data: your name and email address, created when you sign up.",
        "Body data: age, weight, height and the fitness goal you choose.",
        "Activity data: workouts you log (sessions, sets, estimated 1RM), daily nutrition logs (calories, protein, macros, fiber, sugar, sodium), water intake, steps and streaks.",
        "Coach relationships: your coach, your assigned programs and your subscription status.",
        "Messages: chats you exchange with your coach inside the app.",
        "Photos: your profile picture, if you upload one.",
        "Push notification tokens, so we can deliver workout, meal and water reminders.",
      ],
    },
    {
      heading: "2. How we use your data",
      list: [
        "To operate your account and sync your data across devices.",
        "To calculate your calories, macros, rankings and progress charts.",
        "To share your workout and nutrition data with the coach you subscribe to, so they can train you effectively.",
        "To send you reminders and service notifications you can turn off in the app.",
        "To keep the service secure and prevent abuse.",
      ],
      paragraphs: [
        "We do not sell your personal data and we do not use it for third-party advertising.",
      ],
    },
    {
      heading: "3. Where your data is stored",
      paragraphs: [
        "Your data is stored on Supabase (managed PostgreSQL database, authentication and file storage) using encrypted connections in transit. Payments, when you subscribe to a coach, are processed by Stripe; your card details never reach CoreGym's servers. Push notifications are delivered through OneSignal.",
      ],
    },
    {
      heading: "4. Who can see your data",
      list: [
        "You — all your data is visible to you in the app.",
        "Your coach (and only the coach you are subscribed to) can see your workout logs, nutrition data and body data, and can message you.",
        "Other users can see your public review ratings and your rank on the gym leaderboard (first name only).",
        "Service providers that process data on our behalf: Supabase (hosting), Stripe (payments), OneSignal (notifications).",
        "AI analysis (coach dashboard): when a coach runs “Analysis with AI” on a client, CoreGym sends a minimal, non-identifying snapshot of that client's assigned workout program, prescribed nutrition plan and progress/adherence aggregates to Google's Gemini API to generate an educational analysis for the coach. The snapshot excludes contact details, chat messages and raw training logs, is used only to produce that analysis, is not stored by CoreGym, and is handled by Google under its own API terms.",
      ],
    },
    {
      heading: "5. Deleting your account and data",
      paragraphs: [
        "You can delete your account at any time from inside the app: Profile → Delete Account → confirm. Deleting your account permanently removes your profile, body data, workout history, nutrition logs, subscriptions and messages. This action cannot be undone.",
      ],
    },
    {
      heading: "6. Data retention",
      paragraphs: [
        "We keep your data while your account is active. When you delete your account, your personal data is deleted from our production database and the deletion cannot be reversed. Minimal records we must keep for accounting or legal obligations are retained only as long as required by law.",
      ],
    },
    {
      heading: "7. Children's privacy",
      paragraphs: [
        "CoreGym is not directed at children under 13 and we do not knowingly create accounts for children under 13. If you believe a child under 13 has created an account, contact us and we will delete it.",
      ],
    },
    {
      heading: "8. Security",
      paragraphs: [
        "We protect your data with encrypted connections (HTTPS/TLS), database-level access rules (row-level security), and access controls that keep administrative credentials on the server side only — never inside the app.",
      ],
    },
    {
      heading: "9. Your rights",
      paragraphs: [
        "You can access and correct your data in the app at any time, export what you need, and delete your account and data as described above. If you have a privacy request we did not cover, contact us.",
      ],
    },
    {
      heading: "10. Changes to this policy",
      paragraphs: [
        "If we change this policy, we will publish the updated version on this page with a new effective date. Significant changes will also be announced inside the app.",
      ],
    },
    {
      heading: "11. Contact",
      paragraphs: [
        "Questions about this policy or your data: support@coregym.app",
      ],
    },
  ],
};

const ar: LegalContent = {
  title: "سياسة الخصوصية",
  updated: "تاريخ السريان: 28 سبتمبر 2026",
  intro:
    "كور جيم (\"CoreGym\") تُشغّل تطبيق لياقة للعملاء على الموبايل، ولوحة تحكم على الويب للمدربين. توضح هذه السياسة ما نجمعه من بيانات شخصية، وكيف نستخدمها، وما حقوقك — بما فيها كيفية حذف حسابك وبياناتك في أي وقت.",
  sections: [
    {
      heading: "1. البيانات التي نجمعها",
      paragraphs: ["نجمع فقط البيانات اللازمة لتقديم الخدمة:"],
      list: [
        "بيانات الحساب: الاسم والبريد الإلكتروني عند إنشاء الحساب.",
        "بيانات الجسم: السن والوزن والطول وهدف اللياقة الذي تختاره.",
        "بيانات النشاط: التمارين التي تسجلها (الجلسات والضغط وتقدير 1RM)، سجلات التغذية اليومية (السعرات والبروتين والمكرونات والألياف والسكر والصوديوم)، الماء، الخطوات، وسلسلة الالتزام.",
        "علاقتك بالمدرب: مدربك، البرامج المسندة إليك، وحالة اشتراكك.",
        "الرسائل: المحادثات مع مدربك داخل التطبيق.",
        "الصور: صورة ملفك الشخصي إذا رفعت واحدة.",
        "رموز الإشعارات، لتوصيل تذكيرات التمرين والوجبات والماء.",
      ],
    },
    {
      heading: "2. كيف نستخدم بياناتك",
      list: [
        "لتشغيل حسابك ومزامنة بياناتك على أجهزتك.",
        "لحساب السعرات والمكرونات والترتيب ومخططات التقدم.",
        "لمشاركة بيانات التمرين والتغذية مع المدرب الذي تشترك معه ليتمكن من تدريبك.",
        "لإرسال التذكيرات والإشعارات التي يمكنك إيقافها من التطبيق.",
        "لحماية الخدمة ومنع إساءة الاستخدام.",
      ],
      paragraphs: [
        "نحن لا نبيع بياناتك الشخصية ولا نستخدمها في إعلانات لأطراف خارجية.",
      ],
    },
    {
      heading: "3. مكان تخزين بياناتك",
      paragraphs: [
        "تُخزن بياناتك على Supabase (قاعدة بيانات PostgreSQL مُدارة، مع المصادقة وتخزين الملفات) عبر اتصالات مشفرة. أما الدفعات عند الاشتراك في مدرب فتُعالج عبر Stripe؛ ولا تصل بيانات بطاقتك إلى سيرفرات كور جيم إطلاقًا. تُرسل الإشعارات عبر OneSignal.",
      ],
    },
    {
      heading: "4. من يرى بياناتك",
      list: [
        "أنت — كل بياناتك متاحة لك في التطبيق.",
        "مدربك (المدرب المشترك معه فقط) يرى سجلات تمرينك وبيانات تغذيتك وجسمك، ويستطيع مراسلتك.",
        "المستخدمون الآخرون يرون تقييماتك العامة وترتيبك في لوحة الصالة (الاسم الأول فقط).",
        "مزودو الخدمة الذين يعالجون البيانات نيابة عنا: Supabase (الاستضافة)، Stripe (الدفعات)، OneSignal (الإشعارات).",
        "تحليل بالذكاء الاصطناعي (لوحة المدرب): عندما يشغّل المدرب ميزة «تحليل بالذكاء الاصطناعي» لأحد العملاء، يرسل كور جيم لقطة محدودة وغير محدِّدة للهوية من برنامج التمارين المُسند وخطة التغذية الموصوفة ومؤشرات التقدم والالتزام الخاصة بهذا العميل إلى واجهة Gemini من Google لإنتاج تحليل تعليمي للمدرب. تستبعد هذه اللقطة بيانات التواصل والرسائل وسجلات التمارين التفصيلية، وتُستخدم فقط لإنتاج هذا التحليل، ولا تخزّنها كور جيم، وتخضع لمعالجتها لشروط Google API الخاصة.",
      ],
    },
    {
      heading: "5. حذف حسابك وبياناتك",
      paragraphs: [
        "يمكنك حذف حسابك في أي وقت من داخل التطبيق: الملف الشخصي ← حذف الحساب ← تأكيد. حذف الحساب يزيل نهائيًا ملفك الشخصي وبيانات جسمك وسجل تمارينك وسجلات التغذية والاشتراكات والرسائل. هذا الإجراء لا يمكن التراجع عنه.",
      ],
    },
    {
      heading: "6. الاحتفاظ بالبيانات",
      paragraphs: [
        "نحتفظ ببياناتك طوال فترة نشاط حسابك. عند حذف الحساب تُحذف بياناتك الشخصية من قاعدة البيانات نهائيًا ولا يمكن استرجاعها. نحتفظ فقط بأدنى سجلات تلزمنا التزامات محاسبية أو قانونية، ولمدة ما يتطلبه القانون فقط.",
      ],
    },
    {
      heading: "7. خصوصية الأطفال",
      paragraphs: [
        "كور جيم ليست موجهة للأطفال دون 13 عامًا، ولا ننشئ حسابات لهم علمًا بذلك. إذا ظننت أن طفلًا دون 13 أنشأ حسابًا، تواصل معنا وسنحذفه.",
      ],
    },
    {
      heading: "8. الأمان",
      paragraphs: [
        "نحمي بياناتك باتصالات مشفرة (HTTPS/TLS)، وقواعد وصول على مستوى قاعدة البيانات (RLS)، وضوابط تُبقي بيانات الاعتماد الإدارية على السيرفر فقط — ولا توجد داخل التطبيق أبدًا.",
      ],
    },
    {
      heading: "9. حقوقك",
      paragraphs: [
        "يمكنك الوصول إلى بياناتك وتصحيحها في التطبيق في أي وقت، وتصدير ما تحتاجه، وحذف حسابك وبياناتك كما هو موضح أعلاه. لأي طلب متعلق بالخصوصية لم نغطّه، تواصل معنا.",
      ],
    },
    {
      heading: "10. تعديلات هذه السياسة",
      paragraphs: [
        "إذا عدّلنا هذه السياسة سننشر النسخة المحدثة على هذه الصفحة بتاريخ سريان جديد، وسنعلن عن التغييرات المهمة داخل التطبيق أيضًا.",
      ],
    },
    {
      heading: "11. التواصل",
      paragraphs: ["لأي استفسار حول هذه السياسة أو بياناتك: aliabouali2005@gmail.com"],
    },
  ],
};

export default function PrivacyPolicyPage() {
  return <LegalPage content={{ en, ar }} />;
}
