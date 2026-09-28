/* Domain dictionary: "nutrition" — the nutrition programs page, program
   builder dialog, food picker, enroll dialog, and weekly trends charts.
   Register: Egyptian colloquial (السعرات / البروتين / الكارب / الدهون / المية),
   kcal + P/C/F shorthand and DB food names stay as-is. */

export const nutrition = {
  en: {
    page: {
      subtitle: "Build weekly meal plans from the food library, then assign them to clients.",
      coachMissing: "Coach profile missing — complete onboarding to build nutrition programs.",
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
      subtitle: "جهّز خطط وجبات أسبوعية من مكتبة الأكل، وبعدين أسندها للعملاء.",
      coachMissing: "مفيش بروفايل كوتش — كمّل الـ onboarding عشان تقدر تعمل برامج تغذية.",
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
