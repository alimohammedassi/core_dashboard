/* Domain dictionary: "overview". Fill en/ar with mirrored keys — every en key
   MUST have the identical ar key path. */
export const overview = {
  en: {
    pageTitle: "Dashboard Overview",
    realDataOnly: "Real data only",

    header: {
      createWorkout: "Create Workout",
      newMessage: "New Message",
    },

    range: {
      "30d": "Last 30 days",
      month: "This month",
      "90d": "Last 90 days",
      aria: "Stats period",
    },

    trend: {
      new: "New",
      vs: "vs. {n} last period",
    },

    kpi: {
      activeClients: "Active subscribers",
      netRevenue: "Net revenue",
      unread: "Unread messages",
      workouts: "Workouts ({range})",
      gross: "gross {amount}",
      realtime: "Realtime via Supabase",
    },

    today: {
      checkInsValue: "{n} today",
      checkInsLabel: "Client check-ins",
      mealsValue: "{n} logged",
      mealsLabel: "Meals today",
      programsValue: "{n} active",
      programsLabel: "Programs in progress",
    },

    chart: {
      revenueTitle: "Revenue & Growth Velocity",
      subscribersTitle: "New subscribers",
      revenueSeries: "Net revenue",
      subscriberSeries: "New subscribers",
      subscriberCount: "{n} subscribers",
      totalMoney: "{amount} in window",
      totalCount: "{n} in window",
      empty: "No data in this window yet.",
      adherenceTitle: "Overall Client Adherence",
      adherenceOnTrack: "{on} / {total} clients on track",
      adherencePercent: "{p}% adherence",
      revenueToggle: "Revenue ($)",
      subscribersToggle: "Subscribers",
      totalPeriod: "Total Period Value",
      peakWeekly: "Peak Weekly Run-Rate",
      projectedMrr: "Projected Net MRR",
      peakLoad: "Peak Load",
      standard: "Standard",
      weekdaySubtitle: "Daily execution counts across assigned client programs.",
      target: "Target {p}%",
      weekdayTitle: "Workout Activity by Day (Mon–Sun)",
      workoutCount: "{n} workouts",
      completedSeries: "Completed",
    },

    weekday: {
      mon: "Mon",
      tue: "Tue",
      wed: "Wed",
      thu: "Thu",
      fri: "Fri",
      sat: "Sat",
      sun: "Sun",
    },

    status: {
      title: "Subscriber Status",
      totalSuffix: "total",
      active: "Active",
      trial: "Trial",
      cancelled: "Cancelled",
      pastDue: "Past due",
    },

    adherence: {
      high: "HIGH COMPLIANCE",
      moderate: "MODERATE",
      low: "LOW",
      onTrack: "On Track",
      onTrackTh: ">85%",
      atRisk: "At Risk",
      atRiskTh: "70–84%",
      critical: "Critical",
      criticalTh: "<70%",
      viewNonCompliant: "View Non-Compliant Athletes",
      noData: "Adherence data appears once clients log meals against calorie goals.",
    },

    table: {
      title: "Top Active Clients",
      subtitle: "Real-time pacing, adherence scores, and lifetime value for your premier tier athletes.",
      highEngagement: "High Engagement",
      filterRoster: "Filter roster…",
      filterEmpty: "No clients match your filter.",
      adherence: "Adherence",
      lastCheckIn: "Last check-in",
      viewProfile: "View Profile",
      footer: "Showing {shown} of {total} active subscribers",
      exportCsv: "Export CSV",
      client: "Client",
      plan: "Plan",
      started: "Started",
      paid: "Paid to date",
      empty: "No subscribers yet — they appear here as clients subscribe.",
      programsTitle: "Top Programs",
      programsEmpty: "No programs yet",
      programsEmptyHint: "Create your first plan to see it here.",
      id: "ID",
      booked: "Booked",
      revenue: "Revenue",
      rating: "Rating",
    },

    search: {
      placeholder: "Search clients…",
      aria: "Search clients",
      tooShort: "Type at least 2 characters",
      noMatches: "No subscribers match your search",
    },

    ai: {
      title: "AI Assistant",
      hint: "Ask for meal plans, workout tweaks & client insights",
      expand: "Expand",
      open: "Open AI Assistant",
      askHint: "Ask questions about your clients' activity and progress.",
      askCta: "Ask about your clients",
      comingSoon: "AI assistant is coming soon — it will deep-link to Supabase AI.",
    },

    split: {
      title: "Clients breakdown",
      empty: "No client breakdown yet",
      emptyHint: "Stats appear once you have subscriptions.",
    },

    retention: {
      title: "Client Retention Rate",
      empty: "No retention data",
      emptyHint: "Requires at least one subscription.",
      onTrack: "On track for {target}% target",
      showDetails: "Show details",
    },

    revenue: {
      title: "Total Revenue",
      vsLastPeriod: "vs. last period",
      noPrevious: "No previous data",
      previous: "Previous",
      empty: "No revenue data yet",
    },

    activity: {
      title: "Most Active Day",
      empty: "No activity this week",
      emptyHint: "Sessions appear here once assigned.",
      series: "Sessions",
      peakLabel: "Peak",
    },

    upgrade: {
      title: "Upgrade to Premium",
      body: "Manage your subscription plans and pricing.",
      cta: "View plans",
    },

    grow: {
      title: "Grow your coaching!",
      connectedBody: "Payouts are connected — manage plans and take on more clients.",
      connectBody: "Connect payouts to get paid directly for your plans.",
      viewPayouts: "View payouts",
      connectCta: "Connect payouts",
      goSettings: "Go to Settings",
      errorStripe: "Could not start Stripe onboarding",
      errorServer: "Could not reach the server",
    },

    pager: {
      aria: "Pagination",
      pageOf: "Page {page} of {total}",
    },
  },

  ar: {
    pageTitle: "نظرة عامة على الداشبورد",
    realDataOnly: "بيانات حقيقية بس",

    header: {
      createWorkout: "إنشاء تمرين",
      newMessage: "رسالة جديدة",
    },

    range: {
      "30d": "آخر 30 يوم",
      month: "الشهر ده",
      "90d": "آخر 90 يوم",
      aria: "فترة الإحصائيات",
    },

    trend: {
      new: "جديد",
      vs: "مقابل {n} في الفترة اللي فاتت",
    },

    kpi: {
      activeClients: "المشتركين النشطين",
      netRevenue: "صافي الإيرادات",
      unread: "رسايل مش مقروءة",
      workouts: "التمارين ({range})",
      gross: "إجمالي {amount}",
      realtime: "مباشر عن طريق Supabase",
    },

    today: {
      checkInsValue: "{n} النهارده",
      checkInsLabel: "حضور العملاء",
      mealsValue: "اتسجل {n}",
      mealsLabel: "وجبات النهارده",
      programsValue: "{n} نشط",
      programsLabel: "برامج جارية",
    },

    chart: {
      revenueTitle: "الإيرادات وسرعة النمو",
      subscribersTitle: "مشتركين جداد",
      revenueSeries: "صافي الإيرادات",
      subscriberSeries: "مشتركين جداد",
      subscriberCount: "{n} مشترك",
      totalMoney: "{amount} خلال الفترة",
      totalCount: "{n} خلال الفترة",
      empty: "مفيش بيانات في الفترة دي لسه.",
      adherenceTitle: "الالتزام العام للعملاء",
      adherenceOnTrack: "{on} / {total} عملاء ملتزمين",
      adherencePercent: "التزام {p}%",
      revenueToggle: "الإيرادات ($)",
      subscribersToggle: "المشتركين",
      totalPeriod: "قيمة الفترة الكاملة",
      peakWeekly: "أعلى وتيرة أسبوعية",
      projectedMrr: "صافي MRR المتوقع",
      peakLoad: "الحمل الأعلى",
      standard: "عادي",
      weekdaySubtitle: "عدد التمارين اليومية على مدار برامج العملاء المسندة.",
      target: "الهدف {p}%",
      weekdayTitle: "نشاط التمارين بالأيام (الاثنين–الحد)",
      workoutCount: "{n} تمرين",
      completedSeries: "اتعملت",
    },

    weekday: {
      mon: "الاتنين",
      tue: "التلات",
      wed: "الأربع",
      thu: "الخميس",
      fri: "الجمعة",
      sat: "السبت",
      sun: "الحد",
    },

    status: {
      title: "حالة المشتركين",
      totalSuffix: "إجمالي",
      active: "نشط",
      trial: "تجريبي",
      cancelled: "ملغي",
      pastDue: "متأخر",
    },

    adherence: {
      high: "التزام عالٍ",
      moderate: "متوسط",
      low: "منخفض",
      onTrack: "على المسار",
      onTrackTh: ">85%",
      atRisk: "معرض للخطر",
      atRiskTh: "70–84%",
      critical: "حرج",
      criticalTh: "<70%",
      viewNonCompliant: "عرض غير الملتزمين",
      noData: "بيانات الالتزام هتظهر أول ما العملاء يسجلوا وجبات مقابل أهداف السعرات.",
    },

    table: {
      title: "أفضل العملاء النشطين",
      subtitle: "الالتزام والخطط وقيمة كل عميل من أفضل عملائك.",
      highEngagement: "تفاعل عالٍ",
      filterRoster: "فلترة القائمة…",
      filterEmpty: "مفيش عملاء مطابقين للفلتر.",
      adherence: "الالتزام",
      lastCheckIn: "آخر تسجيل",
      viewProfile: "عرض الملف",
      footer: "بيعرض {shown} من {total} مشترك نشط",
      exportCsv: "تصدير CSV",
      client: "العميل",
      plan: "الخطة",
      started: "تاريخ البداية",
      paid: "المدفوع لحد دلوقتي",
      empty: "مفيش مشتركين لسه — هيظهروا هنا أول ما العملاء يشتركوا.",
      programsTitle: "أفضل البرامج",
      programsEmpty: "مفيش برامج لسه",
      programsEmptyHint: "اعمل أول خطة ليك عشان تظهر هنا.",
      id: "المعرف",
      booked: "الحجوزات",
      revenue: "الإيرادات",
      rating: "التقييم",
    },

    search: {
      placeholder: "دوّر على عميل…",
      aria: "دوّر على عملاء",
      tooShort: "اكتب حرفين على الأقل",
      noMatches: "مفيش مشتركين مطابقين للبحث",
    },

    ai: {
      title: "مساعد الـ AI",
      hint: "اطلب خطط أكل، تعديلات على التمارين، وتحليلات عن عملائك",
      expand: "وسّع",
      open: "افتح مساعد الـ AI",
      askHint: "اسأل عن نشاط عملائك وتقدمهم.",
      askCta: "اسأل عن عملائك",
      comingSoon: "مساعد الـ AI جاي قريب — هيكون متوصل بـ Supabase AI.",
    },

    split: {
      title: "تقسيم العملاء",
      empty: "مفيش تقسيم للعملاء لسه",
      emptyHint: "الإحصائيات هتظهر أول ما يكون عندك اشتراكات.",
    },

    retention: {
      title: "نسبة الاحتفاظ بالعملاء",
      empty: "مفيش بيانات احتفاظ",
      emptyHint: "محتاج اشتراك واحد على الأقل.",
      onTrack: "ماشي على هدف {target}%",
      showDetails: "شوف التفاصيل",
    },

    revenue: {
      title: "إجمالي الإيرادات",
      vsLastPeriod: "مقابل الفترة اللي فاتت",
      noPrevious: "مفيش بيانات سابقة",
      previous: "الفترة اللي فاتت",
      empty: "مفيش بيانات إيرادات لسه",
    },

    activity: {
      title: "أكتر يوم نشاط",
      empty: "مفيش نشاط الأسبوع ده",
      emptyHint: "الحصص هتظهر هنا أول ما توزعها.",
      series: "حصص",
      peakLabel: "أعلى يوم",
    },

    upgrade: {
      title: "رقّي لـ Premium",
      body: "نظّم خطط اشتراكاتك والأسعار بتاعتك.",
      cta: "شوف الخطط",
    },

    grow: {
      title: "طوّر شغلك ككوتش!",
      connectedBody: "الأرباح متوصلة — نظّم خططك واقبل عملاء أكتر.",
      connectBody: "وصّل الأرباح عشان تاخد فلوس خططك على طول.",
      viewPayouts: "شوف الأرباح",
      connectCta: "وصّل الأرباح",
      goSettings: "روح الإعدادات",
      errorStripe: "معرفناش نبدأ onboarding بتاع Stripe",
      errorServer: "مش قادرين نوصل للسيرفر",
    },

    pager: {
      aria: "تنقل الصفحات",
      pageOf: "صفحة {page} من {total}",
    },
  },
} as const;
