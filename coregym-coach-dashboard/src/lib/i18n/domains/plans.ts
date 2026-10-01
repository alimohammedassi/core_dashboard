/* Domain dictionary: "plans" — the Stripe subscription plans page and the
   plan create/edit sheet. Register: Egyptian colloquial; "Stripe" and the
   subscription_plans table name stay as-is. */

export const plans = {
  en: {
    page: {
      title: "Coaching Plans & Tiers",
      subtitle: "Configure subscription packages, athlete capacities, and pricing.",
      subtitleShort: "Published coaching packages",
      loadError: "Couldn't load plans. Please try again.",
      kicker: "Monetization engine",
    },

    section: {
      count: "{n} plans",
      metaActive: "{n} active subscriptions",
    },

    kpi: {
      published: "Published plans",
      subscribed: "Subscribed athletes",
      subscribedHint: "Active subscriptions across all tiers",
      avgPrice: "Average plan price",
      avgPriceHint: "Across your published plans",
      activeSubsFooter: "{n} active subscribers",
      avgAcross: "Across {n} plans",
      capSuffix: "/ {n} Cap",
      loaded: "{p}% loaded",
      availableSeats: "Available seats",
      seatsLeft: "Seats left",
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
      presetDays: "{n} days",
      custom: "Custom",
      noCap: "No cap",
      capacityHint: "Seats available before this plan stops accepting athletes.",
      capacityUp: "Add seat",
      capacityDown: "Remove seat",
    },

    drawer: {
      subtitle: "Configure pricing, capacity and cadence",
      deploy: "Save plan",
      discard: "Discard",
    },

    payout: {
      title: "Estimated gross model (15% cut)",
      gross: "Gross plan price",
      fee: "Platform fee (15%)",
      net: "Net per athlete (est.)",
      rosterYield: "Full roster yield ({n} seats)",
      disclaimer: "Estimate — actual Stripe fees may differ.",
    },

    card: {
      tier: "Plan",
      perDays: "/ {n} days",
      upToClients: "Up to {n} clients",
      unlimitedClients: "Unlimited clients",
      mostPopular: "Most popular",
      rosterLoad: "Roster load",
      slotsLeft: "{n} slots left",
      unlimitedSeats: "Unlimited",
      athletesBtn: "Athletes ({n})",
      athletesUnit: "Athletes",
      editPlan: "Edit plan",
    },

    empty: "No plans yet. Create your first plan.",
    emptyHint: "Created plans appear here for clients to subscribe.",

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
      kicker: "محرك الربح",
    },

    section: {
      count: "{n} خطط",
      metaActive: "{n} اشتراك نشط",
    },

    kpi: {
      published: "الخطط المنشورة",
      subscribed: "الرياضيين المشتركين",
      subscribedHint: "اشتراكات نشطة على كل الباقات",
      avgPrice: "متوسط سعر الخطة",
      avgPriceHint: "على كل خططك المنشورة",
      activeSubsFooter: "{n} مشترك نشط",
      avgAcross: "على {n} خطط",
      capSuffix: "/ {n} سعة",
      loaded: "{p}% اتشغلت",
      availableSeats: "المقاعد المتاحة",
      seatsLeft: "مقاعد فاضية",
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
      presetDays: "{n} يوم",
      custom: "مخصص",
      noCap: "من غير حد",
      capacityHint: "عدد المقاعد اللي بتقفل الخطة بعد ما تتملي.",
      capacityUp: "زوّد مقعد",
      capacityDown: "قلّل مقعد",
    },

    drawer: {
      subtitle: "ظبط السعر والسعة والمدة",
      deploy: "احفظ الخطة",
      discard: "سيبها",
    },

    payout: {
      title: "نموذج إجمالي تقديري (عمولة المنصة 15%)",
      gross: "سعر الخطة الكامل",
      fee: "عمولة المنصة (15%)",
      net: "صافي لكل رياضي (تقديري)",
      rosterYield: "عائد القائمة الكاملة ({n} مقاعد)",
      disclaimer: "تقدير — رسوم Stripe الحقيقية ممكن تختلف.",
    },

    card: {
      tier: "خطة",
      perDays: "/ {n} يوم",
      upToClients: "لحد {n} عميل",
      unlimitedClients: "عملاء بلا حدود",
      mostPopular: "الأكثر اشتراكًا",
      rosterLoad: "إشغال القائمة",
      slotsLeft: "{n} مقاعد فاضية",
      unlimitedSeats: "بلا حدود",
      athletesBtn: "الرياضيين ({n})",
      athletesUnit: "رياضي",
      editPlan: "عدّل الخطة",
    },

    empty: "مفيش خطط لسه. اعمل أول خطة ليك.",
    emptyHint: "الخطط اللي هتعملها هتظهر هنا للعملاء ياشتركوا فيها.",

    toasts: {
      invalid: "لازم اسم وسعر صحيح",
      created: "الخطة اتعملت",
      updated: "الخطة اتحدّثت",
      saveFailed: "الحفظ فشل",
    },
  },
} as const;
