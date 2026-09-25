
export type Lang = "en" | "ar";

export const landing = {
  en: {
    dir: "ltr" as const,
    langLabel: "العربية",

    nav: {
      features: "The App",
      coaches: "For Coaches",
      how: "How It Works",
      login: "Coach Login",
    },

    hero: {
      badge: "Everything your training needs, in one place.",
      title1: "Train with a plan.",
      title2: "Track every detail.",
      title3: "Make real progress.",
      sub: "CoreGym connects you with your coach, your workouts, and your nutrition in one app. Your coach can build your plan, you can track everything as you go, and both sides stay updated in real time.",
      ctaCoach: "I'm a coach — get started",
      ctaApp: "I'm training — get the app",
      note: "Free for coaches to get started · iOS & Android for clients",
      motion: "See how it works",
    },

    marquee: [
      "AI food logging",
      "Custom workout plans",
      "Direct coach chat",
      "Progress tracking",
      "Barcode scanning",
      "Personal records",
      "Voice food logging",
      "Coach subscriptions",
      "Streaks & challenges",
      "Workout history",
    ],

    app: {
      kicker: "For clients",
      title: "Your workouts, nutrition, and progress — all in one place.",
      sub: "Everything you need for your day is right inside the app. See your workout, track your meals, follow your progress, and stay connected with your coach without switching between different apps.",

      features: [
        {
          title: "Log your food the way you want",
          body: "Take a photo, use your voice, type it manually, scan a barcode, or choose from your food list. CoreGym makes tracking your meals quick and simple.",
        },
        {
          title: "AI built around real food",
          body: "Get food suggestions based on your goals and what you still have left for the day — including everyday meals and Egyptian foods you actually eat.",
        },
        {
          title: "Know where you stand today",
          body: "Calories, protein, carbs, fats, water, and activity are updated as you go. You always know what you've logged and what you have left.",
        },
        {
          title: "See your progress over time",
          body: "Track workouts, personal records, streaks, weekly progress, and more. Instead of guessing whether you're improving, you can actually see it.",
        },
      ],

      coachNote:
        "When your coach updates your workout or nutrition plan, it shows up in your app. Complete your sessions and log your meals, and your coach can follow your progress from their dashboard.",
    },

    coach: {
      kicker: "For coaches",
      title: "Everything you need to coach your clients in one place.",
      sub: "Create workout and nutrition plans, assign them to your clients, follow their progress, and communicate with them without relying on spreadsheets, screenshots, or scattered messages.",

      features: [
        "Create workout templates and weekly programs you can reuse",
        "Build detailed nutrition plans with meals, portions, and daily targets",
        "Review workout performance set by set — planned vs. completed",
        "Track client progress, adherence, personal records, and trends",
        "Chat with clients using messages, images, voice notes, and files",
        "Manage subscriptions, revenue, and Stripe payments from one dashboard",
      ],

      cta: "Create your coach account",
    },

    how: {
      kicker: "How it works",
      title: "Your coaching workflow, connected from start to finish.",

      steps: [
        {
          title: "Build the plan",
          body: "Create the workout and nutrition plan from your coach dashboard. Set the exercises, sets, reps, meals, targets, and everything your client needs.",
        },
        {
          title: "Your client trains",
          body: "The plan is available directly in the app. Your client can follow the workout, log meals, record results, and message you whenever they need help.",
        },
        {
          title: "Follow the results",
          body: "Workout results, nutrition logs, and progress are available in your dashboard as your client records them. No need to wait for screenshots or weekly updates.",
        },
      ],
    },

    stats: [
      {
        value: 6,
        suffix: "",
        label: "ways to log your meals",
      },
      {
        value: 52,
        suffix: "",
        label: "weeks you can plan ahead",
      },
      {
        value: 100,
        suffix: "%",
        label: "of your workout sets can be tracked",
      },
      {
        value: 1,
        suffix: "",
        label: "place for your entire coaching workflow",
      },
    ],

    cta: {
      title: "Ready to make training easier?",
      sub: "Clients get their workouts, nutrition, and progress in one app. Coaches get the tools to manage their clients without juggling multiple platforms.",

      app: "Get the app",
      appNote: "iOS & Android",

      coach: "Start coaching with CoreGym",
      coachNote: "Free to get started",
    },

    footer: {
      tagline:
        "One platform for coaches, clients, workouts, nutrition, and progress.",

      product: "Product",
      coachLogin: "Coach login",
      coachSignup: "Become a coach",
      rights: "CoreGym. All rights reserved.",
    },
  },

  ar: {
    dir: "rtl" as const,
    langLabel: "English",

    nav: {
      features: "التطبيق",
      coaches: "للكوتشات",
      how: "بيشتغل إزاي",
      login: "دخول الكوتش",
    },

    hero: {
      badge: "كل اللي محتاجه لتمرينك في مكان واحد",
      title1: "اتمرّن بخطة.",
      title2: "سجّل كل حاجة.",
      title3: "وشوف تقدمك.",
      sub: "CoreGym بيجمع التمرين، التغذية، والمتابعة مع الكوتش في تطبيق واحد. الكوتش بيجهزلك خطتك، وإنت بتسجل تمرينك وأكلك، وكل حاجة بتتحدث عند الطرفين في نفس الوقت.",
      ctaCoach: "أنا كوتش — ابدأ دلوقتي",
      ctaApp: "أنا بتمرن — نزّل التطبيق",
      note: "مجاني للكوتش في البداية · متاح على iOS و Android",
      motion: "شوف التطبيق بيشتغل إزاي",
    },

    marquee: [
      "تسجيل الأكل بالـ AI",
      "خطط تمارين مخصصة",
      "شات مباشر مع الكوتش",
      "متابعة التقدم",
      "تسجيل بالباركود",
      "أرقامك القياسية",
      "تسجيل الأكل بالصوت",
      "اشتراكات الكوتشات",
      "Streaks وتحديات",
      "سجل التمارين",
    ],

    app: {
      kicker: "للعملاء",
      title: "تمرينك، أكلك، وتقدمك — كله في مكان واحد.",
      sub: "كل اللي محتاجه خلال يومك موجود في التطبيق. اعرف تمرينك، سجّل أكلك، تابع تقدمك، وخليك على تواصل مع الكوتش من غير ما تستخدم كذا تطبيق.",

      features: [
        {
          title: "سجّل أكلك بالطريقة اللي تناسبك",
          body: "صوّر الأكل، سجله بصوتك، اكتبه بنفسك، اعمل Scan للباركود، أو اختاره من قائمتك. اختار الطريقة الأسرع بالنسبالك وسيب CoreGym يتولى الباقي.",
        },
        {
          title: "AI فاهم الأكل اللي بتاكله فعلاً",
          body: "احصل على اقتراحات أكل مناسبة لهدفك وبناءً على اللي باقي لك خلال اليوم، بما في ده الأكلات المصرية والوجبات اللي بتاكلها بشكل طبيعي.",
        },
        {
          title: "اعرف أنت وصلت لفين النهارده",
          body: "السعرات، البروتين، الكارب، الدهون، الميه، والنشاط بيتحدثوا مع كل حاجة بتسجلها. دايمًا عارف إيه اللي خلصته وإيه اللي لسه باقي.",
        },
        {
          title: "تابع تقدمك مع الوقت",
          body: "شوف التمارين اللي خلصتها، أرقامك القياسية، الـ streaks، وتقدمك أسبوع بعد أسبوع. بدل ما تحاول تحس إنك بتتقدم، هتقدر تشوف التقدم قدامك.",
        },
      ],

      coachNote:
        "أول ما الكوتش يعدّل التمرين أو خطة الأكل، التعديل بيظهر عندك في التطبيق. وإنت لما تسجل تمرينك وأكلك، الكوتش يقدر يتابع تقدمك من الـ dashboard.",
    },

    coach: {
      kicker: "للكوتشات",
      title: "كل أدوات الكوتشينج في مكان واحد.",
      sub: "اعمل خطط التمرين والتغذية، وزّعها على عملائك، تابع نتائجهم، واتكلم معاهم من غير Excel ولا screenshots ولا رسائل متفرقة.",

      features: [
        "اعمل قوالب تمارين وبرامج أسبوعية واستخدمها مع أكتر من عميل",
        "جهّز خطط تغذية بالتفصيل مع الوجبات والكميات والأهداف اليومية",
        "راجع أداء العميل Set by Set — المخطط مقابل اللي اتعمل فعليًا",
        "تابع التقدم، الالتزام، الأرقام القياسية، والتغييرات عند كل عميل",
        "اتكلم مع عملائك من خلال الرسائل والصور والـ voice notes والملفات",
        "إدارة الاشتراكات والإيرادات ومدفوعات Stripe من Dashboard واحدة",
      ],

      cta: "اعمل حساب كوتش",
    },

    how: {
      kicker: "بيشتغل إزاي",
      title: "من تجهيز الخطة لحد متابعة النتيجة — كل حاجة متوصلة.",

      steps: [
        {
          title: "جهّز الخطة",
          body: "اعمل خطة التمرين والتغذية من الـ dashboard. حدد التمارين، الـ sets، الـ reps، الوجبات، الأهداف، وكل التفاصيل اللي العميل محتاجها.",
        },
        {
          title: "العميل يبدأ",
          body: "الخطة بتظهر مباشرة في التطبيق. العميل يقدر يتابع التمرين، يسجل أكله، يسجل نتائجه، ويتواصل معاك وقت ما يحتاج.",
        },
        {
          title: "تابع النتيجة",
          body: "نتائج التمرين، تسجيلات الأكل، والتقدم بتظهر عندك كل ما العميل يسجلها. مش محتاج تستنى screenshots أو update آخر الأسبوع.",
        },
      ],
    },

    stats: [
      {
        value: 6,
        suffix: "",
        label: "طرق مختلفة لتسجيل أكلك",
      },
      {
        value: 52,
        suffix: "",
        label: "أسبوع تقدر تخططهم مقدمًا",
      },
      {
        value: 100,
        suffix: "%",
        label: "من الـ Sets ممكن تتابعها",
      },
      {
        value: 1,
        suffix: "",
        label: "مكان لكل شغلك مع عملائك",
      },
    ],

    cta: {
      title: "خلّي التمرين والمتابعة أسهل.",
      sub: "العميل يلاقي التمرين والتغذية والتقدم في تطبيق واحد، والكوتش يلاقي الأدوات اللي محتاجها لإدارة عملائه من غير ما يفضل يتنقل بين كذا منصة.",

      app: "نزّل التطبيق",
      appNote: "iOS و Android",

      coach: "ابدأ كوتش على CoreGym",
      coachNote: "مجاني في البداية",
    },

    footer: {
      tagline:
        "منصة واحدة للكوتش، العميل، التمرين، التغذية، ومتابعة التقدم.",

      product: "المنتج",
      coachLogin: "دخول الكوتش",
      coachSignup: "اشتغل كوتش مع CoreGym",
      rights: "CoreGym. كل الحقوق محفوظة.",
    },
  },
};

