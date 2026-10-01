/* Domain dictionary: "plans" — the Stripe subscription plans page and the
   plan create/edit dialog. Register: Egyptian colloquial; "Stripe" and the
   subscription_plans table name stay as-is. */

export const plans = {
  en: {
    page: {
      title: "Coaching Plans & Tiers",
      subtitle: "Configure subscription packages, athlete capacities, and pricing.",
      subtitleShort: "Published coaching packages",
      loadError: "Couldn't load plans. Please try again.",
    },

    kpi: {
      published: "Published plans",
      subscribed: "Subscribed athletes",
      subscribedHint: "Active subscriptions across all tiers",
      avgPrice: "Average plan price",
      avgPriceHint: "Across your published plans",
    },

    createAction: "Create Plan",

    form: {
      createTitle: "Create plan",
      editTitle: "Edit plan",
      price: "Price (USD)",
      durationDays: "Duration (days)",
      maxClients: "Max clients (optional)",
      namePlaceholder: "Starter — 1 Month",
      maxClientsPlaceholder: "Leave empty for unlimited",
      saveChanges: "Save changes",
    },

    card: {
      tier: "Plan",
      perDays: "/ {n} days",
      upToClients: "Up to {n} clients",
      unlimitedClients: "Unlimited clients",
    },

    empty: "No plans yet. Create your first plan.",

    toasts: {
      invalid: "Name and valid price required",
      created: "Plan created",
      updated: "Plan updated",
      saveFailed: "Save failed",
    },
  },

  ar: {
    page: {
      title: "خطط الكوتشينج والباقات",
      subtitleShort: "الباقات المنشورة",
      loadError: "معرفناش نجيب الخطط. جرب تاني.",
      subtitle: "ظبط باقات الاشتراك، أعداد العملاء، والأسعار.",
    },

    kpi: {
      published: "الخطط المنشورة",
      subscribed: "الرياضيين المشتركين",
      subscribedHint: "اشتراكات نشطة على كل الباقات",
      avgPrice: "متوسط سعر الخطة",
      avgPriceHint: "على كل خططك المنشورة",
    },

    createAction: "اعمل خطة",

    form: {
      createTitle: "اعمل خطة",
      editTitle: "عدّل الخطة",
      price: "السعر (بالدولار)",
      durationDays: "المدة (بالأيام)",
      maxClients: "أقصى عدد عملاء (اختياري)",
      namePlaceholder: "Starter — شهر واحد",
      maxClientsPlaceholder: "سيبها فاضية لو مفيش حد أقصى",
      saveChanges: "احفظ التعديلات",
    },

    card: {
      tier: "خطة",
      perDays: "/ {n} يوم",
      upToClients: "لحد {n} عميل",
      unlimitedClients: "عملاء بلا حدود",
    },

    empty: "مفيش خطط لسه. اعمل أول خطة ليك.",

    toasts: {
      invalid: "لازم اسم وسعر صحيح",
      created: "الخطة اتعملت",
      updated: "الخطة اتحدّثت",
      saveFailed: "الحفظ فشل",
    },
  },
} as const;
