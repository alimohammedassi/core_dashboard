/* Domain dictionary: "plans" — the Stripe subscription plans page and the
   plan create/edit dialog. Register: Egyptian colloquial; "Stripe" and the
   subscription_plans table name stay as-is. */

export const plans = {
  en: {
    page: {
      title: "Subscription plans",
      subtitle: "Create and edit your coaching plans. Writes go to",
    },

    createAction: "Create plan",

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
      perDays: "/ {n} days",
      upToClients: "Up to {n} clients",
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
      title: "خطط الاشتراك",
      subtitle: "اعمل وعدّل خطط الكوتشينج بتاعتك. الكتابة بتتم في",
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
      perDays: "/ {n} يوم",
      upToClients: "لحد {n} عميل",
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
