import type { Metadata } from "next";
import { LegalPage, type LegalContent } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — CoreGym",
  description:
    "The terms that govern your use of the CoreGym app and coach dashboard.",
};

const en: LegalContent = {
  title: "Terms of Service",
  updated: "Effective date: September 26, 2026",
  intro:
    "These terms govern your use of the CoreGym mobile application and the CoreGym coach dashboard website. By creating an account you agree to them. If you do not agree, please do not use the service.",
  sections: [
    {
      heading: "1. The service",
      paragraphs: [
        "CoreGym lets clients log workouts and nutrition, track progress, and subscribe to coaches; it lets coaches manage clients, build programs and run their business on the web. Features may evolve over time.",
      ],
    },
    {
      heading: "2. Accounts",
      list: [
        "You must provide accurate information and keep it up to date.",
        "Client accounts are created inside the mobile app. Coach accounts are created on the dashboard website and may be approved by CoreGym.",
        "You are responsible for keeping your password safe and for all activity under your account.",
        "You must be at least 13 years old to use the service.",
      ],
    },
    {
      heading: "3. Health disclaimer",
      paragraphs: [
        "CoreGym provides fitness tracking and AI-assisted suggestions. It is not medical advice and does not replace a doctor. Consult a qualified health professional before starting any diet or exercise program, especially if you have a medical condition. Use the app at your own risk.",
      ],
    },
    {
      heading: "4. Acceptable use",
      list: [
        "Do not use the service for anything unlawful or harmful.",
        "Do not harass coaches or other users through chats or reviews.",
        "Do not attempt to access other users' data or the service's administrative systems.",
        "Do not copy, scrape or resell any part of the service.",
      ],
    },
    {
      heading: "5. Subscriptions and payments",
      paragraphs: [
        "When you subscribe to a coach, the subscription and its price are agreed between you and that coach. Payments are processed securely by Stripe; CoreGym never stores your card details. Refunds and cancellations follow the coach's and CoreGym's stated policy at the time of purchase. CoreGym may change its pricing before future purchases, never retroactively.",
      ],
    },
    {
      heading: "6. Your content",
      paragraphs: [
        "You keep ownership of the content you create (workouts, logs, photos, messages). You grant CoreGym a limited license to store and process that content solely to operate the service for you — including showing it to the coach you subscribe to. You are responsible for the content you submit and the reviews you write.",
      ],
    },
    {
      heading: "7. Termination",
      paragraphs: [
        "You can end this agreement at any time by deleting your account from inside the app (Profile → Delete Account), which permanently removes your account and data. We may suspend or terminate accounts that violate these terms or the law.",
      ],
    },
    {
      heading: "8. Disclaimers and liability",
      paragraphs: [
        "The service is provided \"as is\" without warranties of any kind. To the maximum extent permitted by law, CoreGym is not liable for indirect or consequential damages, lost profits or lost data arising from your use of the service. AI-generated suggestions may be imperfect — always apply your own judgment.",
      ],
    },
    {
      heading: "9. Changes to these terms",
      paragraphs: [
        "We may update these terms. The current version is always on this page; continuing to use the service after an update means you accept it.",
      ],
    },
    {
      heading: "10. Contact",
      paragraphs: [
        "Questions about these terms: support@coregym.app",
      ],
    },
  ],
};

const ar: LegalContent = {
  title: "شروط الاستخدام",
  updated: "تاريخ السريان: 26 سبتمبر 2026",
  intro:
    "تحكم هذه الشروط استخدامك لتطبيق كور جيم على الموبايل وموقع لوحة تحكم المدربين. بإنشائك حسابًا فأنت توافق عليها، وإن كنت لا توافق فمن فضلك لا تستخدم الخدمة.",
  sections: [
    {
      heading: "1. الخدمة",
      paragraphs: [
        "تتيح لك كور جيم كعميل تسجيل التمارين والتغذية ومتابعة التقدم والاشتراك في مدربين؛ وتتيح للمدربين إدارة العملاء وبناء البرامج وإدارة أعمالهم من الويب. وقد تتطور الميزات مع الوقت.",
      ],
    },
    {
      heading: "2. الحسابات",
      list: [
        "يجب تقديم معلومات صحيحة وإبقائها محدثة.",
        "حسابات العملاء تُنشأ داخل التطبيق، وحسابات المدربين تُنشأ من الموقع وقد تتم الموافقة عليها من كور جيم.",
        "أنت مسؤول عن الحفاظ على كلمة مرورك وعن كل النشاط الذي يتم عبر حسابك.",
        "يجب أن يكون عمرك 13 عامًا على الأقل لاستخدام الخدمة.",
      ],
    },
    {
      heading: "3. إخلاء المسؤولية الصحية",
      paragraphs: [
        "توفر كور جيم تتبعًا لللياقة واقتراحات بمساعدة الذكاء الاصطناعي. الخدمة ليست استشارة طبية ولا تُغني عن الطبيب. استشر مختصًا مؤهلًا قبل بدء أي نظام تدريب أو غذاء، خاصة إن كان لديك حالة صحية. استخدم التطبيق على مسؤوليتك.",
      ],
    },
    {
      heading: "4. الاستخدام المقبول",
      list: [
        "لا تستخدم الخدمة لأي غرض غير قانوني أو ضار.",
        "لا تتحرش بالمدربين أو المستخدمين الآخرين عبر المحادثات أو التقييمات.",
        "لا تحاول الوصول إلى بيانات مستخدمين آخرين أو الأنظمة الإدارية للخدمة.",
        "لا تنسخ أو تستخرج أو تعيد بيع أي جزء من الخدمة.",
      ],
    },
    {
      heading: "5. الاشتراكات والدفعات",
      paragraphs: [
        "عند اشتراكك في مدرب، فإن الاشتراك وسعره اتفاق بينك وبين ذلك المدرب. تُعالج الدفعات بأمان عبر Stripe؛ ولا تحفظ كور جيم بيانات بطاقتك أبدًا. تخضع الاستردادات والإلغاءات للسياسة المعلنة عند الشراء. قد تغير كور جيم أسعارها قبل عمليات شراء لاحقة، لكن لا يسري أي تغيير بأثر رجعي.",
      ],
    },
    {
      heading: "6. المحتوى الخاص بك",
      paragraphs: [
        "تبقى مالكًا للمحتوى الذي تنشئه (التمارين والسجلات والصور والرسائل). تمنح كور جيم ترخيصًا محدودًا لتخزين ومعالجة هذا المحتوى فقط لتشغيل الخدمة لصالحك — بما في ذلك عرضه للمدرب المشترك معه. أنت مسؤول عن ما ترسله من محتوى وعن التقييمات التي تكتبها.",
      ],
    },
    {
      heading: "7. إنهاء الحساب",
      paragraphs: [
        "يمكنك إنهاء هذه الاتفاقية في أي وقت بحذف حسابك من داخل التطبيق (الملف الشخصي ← حذف الحساب)، وهو ما يزيل حسابك وبياناتك نهائيًا. ويحق لنا إيقاف أو إنهاء الحسابات التي تخالف هذه الشروط أو القانون.",
      ],
    },
    {
      heading: "8. إخلاء المسؤولية والحد من المسؤولية",
      paragraphs: [
        "تُقدم الخدمة \"كما هي\" دون أي ضمانات. إلى أقصى حد يسمح به القانون، لا تتحمل كور جيم مسؤولية أي أضرار غير مباشرة أو تبعية أو أرباح مفقودة أو بيانات مفقودة ناتجة عن استخدامك للخدمة. قد لا تكون اقتراحات الذكاء الاصطناعي مثالية — استخدم حكمك الشخصي دائمًا.",
      ],
    },
    {
      heading: "9. تعديلات هذه الشروط",
      paragraphs: [
        "قد نحدّث هذه الشروط. النسخة الحالية متاحة دائمًا على هذه الصفحة، واستمرارك في استخدام الخدمة بعد أي تحديث يعني موافقتك عليه.",
      ],
    },
    {
      heading: "10. التواصل",
      paragraphs: ["لأي استفسار حول هذه الشروط: support@coregym.app"],
    },
  ],
};

export default function TermsPage() {
  return <LegalPage content={{ en, ar }} />;
}
