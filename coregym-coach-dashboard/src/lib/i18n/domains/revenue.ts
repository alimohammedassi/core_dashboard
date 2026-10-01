/* Domain dictionary: "revenue" — Revenue & financial telemetry page (KPIs,
   weekly velocity chart, settlement routing, billing ledger, payouts).
   Mirror rule: every en key has the identical ar key path. Register: Egyptian
   colloquial like the landing. */
export const revenue = {
  en: {
    page: {
      title: "Revenue & financial telemetry",
      subtitleLive:
        "Live Stripe payouts plus your local payment_intents transactions — all real data for this coach.",
      subtitleLocal:
        "Your real transactions from payment_intents (Supabase). Payouts appear once Stripe Connect is active.",
      badgeLive: "Live Stripe data",
      badgeLocal: "Real data — payment_intents",
      connected: "Live Stripe data",
      connectedAcct: "Live Stripe data • ••{acct}",
      portal: "Stripe Portal",
    },

    range: {
      "30d": "Last 30 days",
      "90d": "Last 90 days",
      all: "All time",
      aria: "Revenue period",
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
        prev: "Prev: {money}",
        billings: "{n} transactions",
      },
      commission: {
        title: "Platform commission",
        descLive: "Stripe fees (live)",
        descEstimate: "15% estimate",
        fixed: "Fixed 15.0%",
        actualLive: "{p}% actual",
      },
      net: {
        title: "Net payout",
        desc: "To coach",
        retained: "{p}% net retained",
      },
      next: {
        title: "Upcoming settlement",
        arrival: "Estimated arrival {date}",
        methodStandard: "Standard",
        methodInstant: "Instant",
      },
    },

    chart: {
      title: "Weekly net velocity",
      subtitle: "Net vs platform share per week across the selected window.",
      legendNet: "Net",
      legendPlatform: "Platform (15%)",
      avgDaily: "Avg. daily velocity: {money}/day",
      txInRange: "{n} transactions in range",
      empty: "No payments in this window yet.",
    },

    routing: {
      title: "Settlement routing",
      subtitle: "Live Stripe balance for your connected account.",
      available: "Available",
      pending: "Pending",
      liquidity: "{p}% available",
      connectCta: "Connect Stripe in Settings",
      connectHint: "Payout routing appears once Stripe Connect is active.",
      unavailable: "Live balance unavailable right now.",
    },

    tx: {
      title: "Athlete billing ledger",
      desc: "Real payment_intents rows for your coach ({n} shown). Source: Supabase payment_intents table.",
      searchPlaceholder: "Search athlete, email or tx id…",
      id: "Transaction ID",
      athlete: "Athlete",
      planTier: "Plan",
      gross: "Gross",
      fee: "Fee",
      feeEst: "Fee (est. 15%)",
      net: "Net",
      timestamp: "Timestamp",
      showing: "Showing {shown} of {total}",
      matches: "{n} matches on this page",
      empty: "No transactions yet — real data will appear here when clients pay.",
    },

    payouts: {
      title: "Payouts",
      descLive: "Real Stripe payouts for your connected account.",
      descLocal: "Connect Stripe in Settings to see real payouts. No mock data shown.",
      arrival: "Arrival",
      empty: "No payouts yet.",
      destination: "Destination: {v}",
      settled: "Settled {date}",
      estimated: "Est. arrival {date}",
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
      title: "الإيرادات والرقابة المالية",
      subtitleLive:
        "تحويلات Stripe المباشرة ومعاملات payment_intents المحلية بتاعتك — كلها بيانات حقيقية للكوتش ده.",
      subtitleLocal:
        "معاملاتك الحقيقية من payment_intents (Supabase). التحويلات هتظهر أول ما يتشغل Stripe Connect.",
      badgeLive: "بيانات Stripe مباشرة",
      badgeLocal: "بيانات حقيقية — payment_intents",
      connected: "بيانات Stripe مباشرة",
      connectedAcct: "بيانات Stripe مباشرة • ••{acct}",
      portal: "بوابة Stripe",
    },

    range: {
      "30d": "آخر 30 يوم",
      "90d": "آخر 90 يوم",
      all: "كل الفترة",
      aria: "فترة الإيرادات",
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
        prev: "الفترة اللي فاتت: {money}",
        billings: "{n} معاملة",
      },
      commission: {
        title: "عمولة المنصة",
        descLive: "رسوم Stripe (مباشرة)",
        descEstimate: "تقدير 15%",
        fixed: "ثابتة 15.0%",
        actualLive: "{p}% فعلية",
      },
      net: {
        title: "صافي التحويل",
        desc: "للكوتش",
        retained: "{p}% صافي محتفظ بيه",
      },
      next: {
        title: "التسوية الجاية",
        arrival: "الوصول المتوقع {date}",
        methodStandard: "عادية",
        methodInstant: "فورية",
      },
    },

    chart: {
      title: "سرعة الصافي الأسبوعية",
      subtitle: "الصافي مقابل عمولة المنصة كل أسبوع في الفترة المختارة.",
      legendNet: "الصافي",
      legendPlatform: "المنصة (15%)",
      avgDaily: "متوسط السرعة اليومية: {money}/يوم",
      txInRange: "{n} معاملة في الفترة",
      empty: "مفيش مدفوعات في الفترة دي لسه.",
    },

    routing: {
      title: "توجيه التحويلات",
      subtitle: "رصيد Stripe المباشر من حسابك المربوط.",
      available: "متاح",
      pending: "معلّق",
      liquidity: "{p}% متاح",
      connectCta: "اربط Stripe من الإعدادات",
      connectHint: "تفاصيل التحويلات هتظهر أول ما يتشغل Stripe Connect.",
      unavailable: "الرصيد المباشر مش متاح دلوقتي.",
    },

    tx: {
      title: "سجل فواتير الرياضيين",
      desc: "صفوف payment_intents الحقيقية بتاعتك ({n} معروضة). المصدر: جدول payment_intents في Supabase.",
      searchPlaceholder: "دوّر على رياضي أو إيميل أو رقم معاملة…",
      id: "رقم المعاملة",
      athlete: "الرياضي",
      planTier: "الخطة",
      gross: "الإجمالي",
      fee: "الرسوم",
      feeEst: "الرسوم (تقدير 15%)",
      net: "الصافي",
      timestamp: "التاريخ والوقت",
      showing: "معروض {shown} من {total}",
      matches: "{n} نتيجة في الصفحة دي",
      empty: "مفيش معاملات لسه — البيانات الحقيقية هتظهر هنا أول ما العملاء يدفعوا.",
    },

    payouts: {
      title: "التحويلات",
      descLive: "تحويلات Stripe الحقيقية من حسابك المربوط.",
      descLocal: "اربط Stripe من الإعدادات عشان تشوف تحويلات حقيقية. مفيش بيانات وهمية هنا.",
      arrival: "تاريخ الوصول",
      empty: "مفيش تحويلات لسه.",
      destination: "الوجهة: {v}",
      settled: "اتسوّت {date}",
      estimated: "الوصول المتوقع {date}",
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
