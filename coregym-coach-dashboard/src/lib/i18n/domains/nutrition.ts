/* Domain dictionary: "nutrition" — the nutrition programs page, program
   builder dialog, food picker, enroll dialog, and weekly trends charts.
   Register: Egyptian colloquial (السعرات / البروتين / الكارب / الدهون / المية),
   kcal + P/C/F shorthand and DB food names stay as-is. */

export const nutrition = {
  en: {
    page: {
      title: "Nutrition Programs & Macro Blueprints",
      subtitle: "Build weekly meal plans from the food library, then assign them to clients.",
      coachMissing: "Coach profile missing — complete onboarding to build nutrition programs.",
      kicker: "Dietary telemetry",
    },

    metrics: {
      avgEnergyLabel: "Avg kcal / day",
      programsLabel: "Nutrition programs",
      assignmentsFooter: "{n} active assignment(s) · {m} client(s)",
      adherenceLabel: "Meal adherence · 7d",
      adherenceFooter: "{completed}/{planned} completed",
      noData: "No meals elapsed yet",
      swapsLabel: "Client swaps · 7d",
      swapsFooter: "Substitutions & quantity changes",
    },

    createProgram: "Create Program",

    empty: {
      title: "No nutrition programs yet.",
      hint: "Build a weekly meal plan from the food library, then assign it to clients.",
    },

    weekdays: {
      mon: { short: "Mon", full: "Monday" },
      tue: { short: "Tue", full: "Tuesday" },
      wed: { short: "Wed", full: "Wednesday" },
      thu: { short: "Thu", full: "Thursday" },
      fri: { short: "Fri", full: "Friday" },
      sat: { short: "Sat", full: "Saturday" },
      sun: { short: "Sun", full: "Sunday" },
    },

    card: {
      mealsTitle: "{n} meal(s)",
      rest: "Rest",
      noSubscribers: "No active subscribers",
      assign: "Assign to client",
      active: "Active",
      kcalDay: "{kcal} kcal/day",
    },

    builder: {
      titleCreate: "Create nutrition program",
      titleEdit: "Edit nutrition program",
      description:
        "Different meals per day, flexible meal count. Quantities use each food's own serving unit.",
      namePlaceholder: "e.g. Lean Mass — Week Plan",
      notes: "Notes",
      notesPlaceholder: "Coach notes…",
      defaultMeal: "Breakfast",
      numberedMeal: "Meal {n}",
      newMeal: "Meal",
      restDay: "Rest day",
      addFood: "Add food",
      mealNameAria: "Meal name",
      moveUp: "Move up",
      moveDown: "Move down",
      removeMeal: "Remove meal",
      removeFood: "Remove food",
      quantityAria: "Quantity in {unit}",
      units: "units",
      foodFallback: "Food",
      mealTotal: "Meal total: {macros}",
      weeklyOverview: "Weekly overview (planned days):",
      selectDay: "Select a weekday above to add meals.",
      saveChanges: "Save changes",
      create: "Create program",
      dayKcal: "{kcal} kcal",
      dayMacrosTitle: "Day macros",
      unsavedNote: "Changes save only when you press Save.",
    },

    macros: {
      calories: "Calories",
      protein: "Protein",
      carbs: "Carbs",
      fat: "Fat",
      compact: "{kcal} kcal · {p}P / {c}C / {f}F",
    },

    picker: {
      title: "Add food",
      description: "Search the food library. Values shown per serving basis.",
      placeholder: "Search foods… (e.g. chicken)",
      searching: "Searching…",
      noResults: "No foods found — try another search.",
      searchFailed: "Search failed",
      quickInsert: "Quick insert",
      serving: "{size} {unit}",
      kcalShort: "Kcal",
      proteinShort: "Protein",
      carbsShort: "Carbs",
      fatShort: "Fat",
    },

    enrollment: {
      current: "Current",
      metrics: {
        completed: "Completed",
        planned: "Planned",
        skipped: "Skipped",
        weeks: "Weeks",
      },
      lastLogged: "Last logged: {meal} · {date}",
      noLogs: "Nothing logged yet",
      skippedFooter: "Excluded from current totals",
      upcomingMeals: "{n} meals upcoming",
    },

    enroll: {
      title: "Assign “{name}”",
      description: "Client must have an active subscription. ~{n} meals will be generated.",
      client: "Client",
      startDate: "Start date",
      durationWeeks: "Duration (weeks)",
      assignAction: "Assign program",
      assigning: "Assigning…",
      selectClient: "Select a client",
      assignedToast: "Assigned — {n} meals generated",
    },

    trends: {
      week: "W{n}",
      caloriesTitle: "Calories per week (kcal)",
      macrosTitle: "Actual macros per week (g)",
      adherenceTitle: "Adherence per week (%)",
      prescribed: "Prescribed",
      actual: "Actual",
      adherence: "Adherence",
      empty: "No nutrition data yet for this enrollment — charts appear once days elapse.",
      adherenceNote:
        "Completed meals ÷ elapsed planned meals. Future weeks show no bar until days elapse.",
    },

    toasts: {
      programCreated: "Program created",
      programUpdated: "Program updated",
      programDeleted: "Program deleted",
      programDuplicated: "Program duplicated — reopen it to edit",
      saveFailed: "Save failed",
      deleteFailed: "Delete failed",
      duplicateFailed: "Duplicate failed",
      assignmentFailed: "Assignment failed",
      nameRequired: "Program name is required",
    },

    confirmDelete: "Delete program “{name}”? This cannot be undone.",
  },

  ar: {
    page: {
      title: "برامج التغذية والمخططات الغذائية",
      subtitle: "جهّز خطط وجبات أسبوعية من مكتبة الأكل، وبعدين أسندها للعملاء.",
      coachMissing: "مفيش بروفايل كوتش — كمّل الـ onboarding عشان تقدر تعمل برامج تغذية.",
      kicker: "بيانات التغذية",
    },

    metrics: {
      avgEnergyLabel: "متوسط السعرات / يوم",
      programsLabel: "برامج التغذية",
      assignmentsFooter: "{n} إسناد نشط · {m} عملاء",
      adherenceLabel: "التزام الوجبات · ٧ أيام",
      adherenceFooter: "{completed}/{planned} مكتملة",
      noData: "لسه مفيش وجبات عدّت",
      swapsLabel: "تعديلات العملاء · ٧ أيام",
      swapsFooter: "استبدالات وتغييرات كميات",
    },

    createProgram: "اعمل برنامج",

    empty: {
      title: "مفيش برامج تغذية لسه.",
      hint: "جهّز خطة وجبات أسبوعية من مكتبة الأكل، وبعدين أسندها للعملاء.",
    },

    weekdays: {
      mon: { short: "إثنين", full: "الاتنين" },
      tue: { short: "تلات", full: "التلات" },
      wed: { short: "أربع", full: "الأربع" },
      thu: { short: "خميس", full: "الخميس" },
      fri: { short: "جمعة", full: "الجمعة" },
      sat: { short: "سبت", full: "السبت" },
      sun: { short: "أحد", full: "الأحد" },
    },

    card: {
      mealsTitle: "{n} وجبة",
      rest: "راحة",
      noSubscribers: "مفيش عملاء مشتركين",
      assign: "أسندها لعميل",
      active: "نشط",
      kcalDay: "{kcal} kcal/يوم",
    },

    builder: {
      titleCreate: "اعمل برنامج تغذية",
      titleEdit: "عدّل برنامج التغذية",
      description: "وجبات مختلفة لكل يوم، وعدد وجبات مرن. الكميات بوحدة القياس بتاعة كل أكلة.",
      namePlaceholder: "مثال: تضخيم نضيف — خطة أسبوعية",
      notes: "ملاحظات",
      notesPlaceholder: "ملاحظات الكوتش…",
      defaultMeal: "فطار",
      numberedMeal: "وجبة {n}",
      newMeal: "وجبة",
      restDay: "يوم راحة",
      addFood: "ضيف أكلة",
      mealNameAria: "اسم الوجبة",
      moveUp: "انقل لفوق",
      moveDown: "انقل لتحت",
      removeMeal: "شيل الوجبة",
      removeFood: "شيل الأكلة",
      quantityAria: "الكمية بوحدة {unit}",
      units: "وحدات",
      foodFallback: "أكلة",
      mealTotal: "إجمالي الوجبة: {macros}",
      weeklyOverview: "ملخص الأسبوع (الأيام المخططة):",
      selectDay: "اختار يوم من الأسبوع فوق عشان تضيف وجبات.",
      saveChanges: "احفظ التعديلات",
      create: "اعمل البرنامج",
      dayKcal: "{kcal} kcal",
      dayMacrosTitle: "ماكروز اليوم",
      unsavedNote: "التغييرات متسجلش غير لما تدوس حفظ.",
    },

    macros: {
      calories: "السعرات",
      protein: "البروتين",
      carbs: "الكارب",
      fat: "الدهون",
      compact: "{kcal} kcal · {p}P / {c}C / {f}F",
    },

    picker: {
      title: "ضيف أكلة",
      description: "دوّر في مكتبة الأكل. القيم محسوبة لكل حصة (serving).",
      placeholder: "دوّر على أكلة… (مثلاً فراخ)",
      searching: "بدوّر…",
      noResults: "مفيش أكلات — جرّب كلمة تانية.",
      searchFailed: "البحث فشل",
      quickInsert: "إضافة سريعة",
      serving: "{size} {unit}",
      kcalShort: "كالوري",
      proteinShort: "بروتين",
      carbsShort: "كارب",
      fatShort: "دهون",
    },

    enrollment: {
      current: "الحالي",
      metrics: {
        completed: "مكتملة",
        planned: "مخططة",
        skipped: "متخطاة",
        weeks: "أسابيع",
      },
      lastLogged: "آخر تسجيل: {meal} · {date}",
      noLogs: "لسه مفيش تسجيل",
      skippedFooter: "مستثناة من إجماليات الحالي",
      upcomingMeals: "{n} وجبة جاية",
    },

    enroll: {
      title: "أسند “{name}”",
      description: "لازم العميل يكون عنده اشتراك شغّال. هيتولد حوالي {n} وجبة.",
      client: "العميل",
      startDate: "تاريخ البداية",
      durationWeeks: "المدة (بالأسابيع)",
      assignAction: "أسند البرنامج",
      assigning: "بيسند…",
      selectClient: "اختار عميل",
      assignedToast: "اتسندت — اتولد {n} وجبة",
    },

    trends: {
      week: "أسبوع {n}",
      caloriesTitle: "السعرات أسبوعيًا (kcal)",
      macrosTitle: "الماكروز الفعلية أسبوعيًا (جم)",
      adherenceTitle: "الالتزام أسبوعيًا (%)",
      prescribed: "المخطط",
      actual: "الفعلي",
      adherence: "الالتزام",
      empty: "مفيش بيانات تغذية للاشتراك ده لسه — الرسومات بتظهر أول ما الأيام تعدي.",
      adherenceNote:
        "الوجبات المكتملة ÷ الوجبات المخططة اللي عدّت. أسابيع المستقبل مش هتظهر ليها أعمدة غير لما الأيام تعدي.",
    },

    toasts: {
      programCreated: "البرنامج اتعمل",
      programUpdated: "البرنامج اتحدّث",
      programDeleted: "البرنامج اتمسح",
      programDuplicated: "اتنسخ البرنامج — افتحه تاني عشان تعدّل فيه",
      saveFailed: "الحفظ فشل",
      deleteFailed: "الحذف فشل",
      duplicateFailed: "النسخ فشل",
      assignmentFailed: "الإسناد فشل",
      nameRequired: "لازم تكتب اسم للبرنامج",
    },

    confirmDelete: "متأكد إنك عايز تمسح برنامج “{name}”؟ ده مش بيرجع.",
  },
} as const;
