/* Domain dictionary: "misc" — root/dashboard error boundaries, the branded 404
   page and legal-page metadata. Register: Egyptian colloquial for UI copy;
   Modern Standard Arabic for legal metadata. Error titles/buttons reuse
   common.state.error, common.actions.retry and common.nav.overview. */

export const misc = {
  en: {
    errors: {
      rootBody:
        "The page failed to load. Please try again — if it keeps happening, contact support and mention reference {digest}.",
      rootBodyNoDigest:
        "The page failed to load. Please try again — if it keeps happening, contact support.",
      sectionTitle: "Couldn't load this section",
      sectionBody:
        "Something went wrong while loading this dashboard section (reference {digest}). Your data is safe — try again or pick another section.",
      sectionBodyNoDigest:
        "Something went wrong while loading this dashboard section. Your data is safe — try again or pick another section.",
    },

    notFound: {
      title: "Page not found",
      body: "The page you are looking for does not exist or was moved.",
      backToDashboard: "Back to dashboard",
    },

    legal: {
      privacyTitle: "Privacy Policy — CoreGym",
      privacyDescription: "How CoreGym collects, uses, stores and deletes your personal data.",
      termsTitle: "Terms of Service — CoreGym",
      termsDescription: "The terms that govern your use of the CoreGym app and coach dashboard.",
    },
  },

  ar: {
    errors: {
      rootBody:
        "الصفحة فشلت في التحميل. جرّب تاني — ولو المشكلة استمرت كلمنا واذكر الكود المرجعي {digest}.",
      rootBodyNoDigest: "الصفحة فشلت في التحميل. جرّب تاني — ولو المشكلة استمرت كلمنا.",
      sectionTitle: "مش قادرين نحمّل القسم ده",
      sectionBody:
        "حصل خطأ أثناء تحميل القسم ده من الداشبورد (الكود المرجعي {digest}). بياناتك في أمان — جرّب تاني أو اختار قسم تاني.",
      sectionBodyNoDigest:
        "حصل خطأ أثناء تحميل القسم ده من الداشبورد. بياناتك في أمان — جرّب تاني أو اختار قسم تاني.",
    },

    notFound: {
      title: "الصفحة مش موجودة",
      body: "الصفحة اللي بتدور عليها مش موجودة أو اتنقلت.",
      backToDashboard: "رجوع للداشبورد",
    },

    legal: {
      privacyTitle: "سياسة الخصوصية — CoreGym",
      privacyDescription: "كيف تجمع CoreGym بياناتك الشخصية وتستخدمها وتخزّنها وتحذفها.",
      termsTitle: "شروط الاستخدام — CoreGym",
      termsDescription: "الشروط التي تحكم استخدامك لتطبيق CoreGym ولوحة تحكم الكوتش.",
    },
  },
} as const;
