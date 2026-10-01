/* Domain dictionary: "revenue" — Revenue & Payments page (KPIs, transactions
   table, payouts table, Stripe status badges). Mirror rule: every en key has
   the identical ar key path. Register: Egyptian colloquial like the landing. */
export const revenue = {
  en: {
    page: {
      title: "Revenue & Payments",
      subtitleLive:
        "Live Stripe payouts plus your local payment_intents transactions — all real data for this coach.",
      subtitleLocal:
        "Your real transactions from payment_intents (Supabase). Payouts appear once Stripe Connect is active.",
      badgeLive: "Live Stripe data",
      badgeLocal: "Real data — payment_intents",
    },

    notes: {
      stripe: "Stripe note: {message}",
      db: "Database note: {message}",
      stripeMasked: "Stripe payout data is temporarily unavailable — the ledger below still reflects your recorded payments.",
      dbMasked: "Couldn't load recent transactions right now. Please try again.",
    },

    kpi: {
      gross: {
        title: "Gross revenue",
        desc: "From succeeded payment_intents",
      },
      commission: {
        title: "Platform commission",
        descLive: "Stripe fees (live)",
        descEstimate: "15% estimate",
      },
      net: {
        title: "Net payout",
        desc: "To coach",
      },
      next: {
        title: "Upcoming settlement",
        arrival: "Estimated arrival {date}",
      },
    },

    tx: {
      title: "Transactions",
      desc: "Real payment_intents rows for your coach ({n} shown). Source: Supabase payment_intents table.",
      id: "ID",
      client: "Client",
      empty: "No transactions yet — real data will appear here when clients pay.",
    },

    payouts: {
      title: "Payouts",
      descLive: "Real Stripe payouts for your connected account.",
      descLocal: "Connect Stripe in Settings to see real payouts. No mock data shown.",
      arrival: "Arrival",
      empty: "No payouts yet.",
    },

    status: {
      succeeded: "Succeeded",
      pending: "Pending",
      failed: "Failed",
      paid: "Paid",
      inTransit: "In transit",
      canceled: "Canceled",
      processing: "Processing",
    },
  },

  ar: {
    page: {
      title: "الإيرادات والمدفوعات",
      subtitleLive:
        "تحويلات Stripe المباشرة ومعاملات payment_intents المحلية بتاعتك — كلها بيانات حقيقية للكوتش ده.",
      subtitleLocal:
        "معاملاتك الحقيقية من payment_intents (Supabase). التحويلات هتظهر أول ما يتشغل Stripe Connect.",
      badgeLive: "بيانات Stripe مباشرة",
      badgeLocal: "بيانات حقيقية — payment_intents",
    },

    notes: {
      stripe: "ملاحظة Stripe: {message}",
      db: "ملاحظة قاعدة البيانات: {message}",
      stripeMasked: "بيانات أرباح Stripe مش متاحة مؤقتًا — السجل تحت لسه بيعكس المدفوعات المسجلة.",
      dbMasked: "معرفناش نجيب آخر المعاملات دلوقتي. جرب تاني.",
    },

    kpi: {
      gross: {
        title: "إجمالي الإيرادات",
        desc: "من عمليات payment_intents الناجحة",
      },
      commission: {
        title: "عمولة المنصة",
        descLive: "رسوم Stripe (مباشرة)",
        descEstimate: "تقدير 15%",
      },
      net: {
        title: "صافي التحويل",
        desc: "للكوتش",
      },
      next: {
        title: "التسوية الجاية",
        arrival: "الوصول المتوقع {date}",
      },
    },

    tx: {
      title: "المعاملات",
      desc: "صفوف payment_intents الحقيقية بتاعتك ({n} معروضة). المصدر: جدول payment_intents في Supabase.",
      id: "المعرّف",
      client: "العميل",
      empty: "مفيش معاملات لسه — البيانات الحقيقية هتظهر هنا أول ما العملاء يدفعوا.",
    },

    payouts: {
      title: "التحويلات",
      descLive: "تحويلات Stripe الحقيقية من حسابك المربوط.",
      descLocal: "اربط Stripe من الإعدادات عشان تشوف تحويلات حقيقية. مفيش بيانات وهمية هنا.",
      arrival: "تاريخ الوصول",
      empty: "مفيش تحويلات لسه.",
    },

    status: {
      succeeded: "ناجحة",
      pending: "معلّقة",
      failed: "فاشلة",
      paid: "مدفوعة",
      inTransit: "في الطريق",
      canceled: "ملغاة",
      processing: "قيد المعالجة",
    },
  },
} as const;
