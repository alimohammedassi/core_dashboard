/* Domain dictionary: "chat" — chat page, conversation list/thread, media
   messages and the voice recorder. Mirror rule: every en key has the identical
   ar key path. Register: Egyptian colloquial like the landing ("شات", "عميل"). */
export const chat = {
  en: {
    page: {
      title: "Chat",
      descA: "Same conversations as the mobile app. Realtime via",
      descB: "table. Mirrors Flutter chat with no changes needed there.",
    },

    clientFallback: "Client",

    list: {
      title: "Athletes",
      count: "{n} conversations",
      filterUnread: "Unread only",
      empty: "No conversations yet.",
      searchPlaceholder: "Search conversations…",
      searchEmpty: "No conversations match your search.",
    },

    thread: {
      select: "Select a conversation",
      clientProfile: "Client Profile",
      back: "Back",
      realtime: "Realtime",
      realtimeConnected: "Realtime connected",
      realtimeOffline: "Reconnecting…",
      loadOlder: "Load older messages",
      loadingOlder: "Loading older messages…",
      unread: " · unread",
      errorLoad: "Failed to load messages: {message}",
      errorLoadOlder: "Failed to load older messages: {message}",
      errorMarkRead: "Couldn't mark messages as read — check your connection",
    },

    receipt: {
      sent: "Sent",
      read: "Read",
    },

    composer: {
      placeholder: "Type a message…",
      inputHint: "Enter to send · Shift + Enter for new line",
      attachImage: "Attach image",
      attachFile: "Attach file",
      removeAttachment: "Remove attachment",
      send: "Send",
      sendAttachment: "Send attachment",
      pendingSize: "({n} KB)",
      attachmentFailed: "Attachment failed",
      voiceFailed: "Voice note failed",
    },

    media: {
      unavailable: "Attachment unavailable",
      voiceNote: "Voice note",
      play: "Play",
      pause: "Pause",
      imageAlt: "Shared image",
      loadingImage: "Loading image…",
      loadingVoice: "Loading voice note…",
      seconds: "{s}s",
      clickToDownload: "Click to download",
      preparing: "Preparing download…",
      fileFallback: "File",
      previewNone: "No messages yet",
      previewPhoto: "📷 Photo",
      previewVoice: "🎤 Voice note ({s}s)",
      previewFile: "📄 {name}",
      previewWorkout: "🏋️ Workout plan",
      previewNutrition: "🥗 Nutrition plan",
      previewMessage: "Message",
      attachmentFailed: "Attachment failed",
    },

    recorder: {
      record: "Record voice note",
      discardRecording: "Discard recording",
      stop: "Stop recording",
      discard: "Discard",
      send: "Send voice note",
      micDenied: "Microphone access is required to record a voice note.",
    },
  },

  ar: {
    page: {
      title: "الشات",
      descA: "نفس محادثات التطبيق. تحديث لحظي عن طريق جدول",
      descB: "متطابق مع شات Flutter من غير أي تغييرات هناك.",
    },

    clientFallback: "عميل",

    list: {
      title: "الرياضيين",
      count: "{n} محادثات",
      filterUnread: "غير المقروءة فقط",
      searchPlaceholder: "دوّر على محادثة…",
      searchEmpty: "مفيش محادثات مطابقة للبحث.",
      empty: "مفيش محادثات لسه.",
    },

    thread: {
      select: "اختار محادثة",
      clientProfile: "ملف العميل",
      back: "رجوع",
      realtime: "تحديث لحظي",
      realtimeConnected: "التحديث اللحظي متصل",
      realtimeOffline: "بنعيد الاتصال…",
      loadOlder: "حمّل رسائل أقدم",
      loadingOlder: "بنحمّل رسائل أقدم…",
      unread: " · غير مقروءة",
      errorLoad: "فشل تحميل الرسائل: {message}",
      errorLoadOlder: "فشل تحميل الرسائل الأقدم: {message}",
      errorMarkRead: "معرفناش نعلّم الرسائل إنها اتقرت — شيك على اتصالك",
    },

    receipt: {
      sent: "اتبعته",
      read: "اتقرت",
    },

    composer: {
      placeholder: "اكتب رسالة…",
      inputHint: "Enter للإرسال · Shift + Enter لسطر جديد",
      attachImage: "أرفق صورة",
      attachFile: "أرفق ملف",
      removeAttachment: "شيل المرفق",
      send: "ابعت",
      sendAttachment: "ابعت المرفق",
      pendingSize: "({n} KB)",
      attachmentFailed: "فشل إرسال المرفق",
      voiceFailed: "فشل إرسال الرسالة الصوتية",
    },

    media: {
      unavailable: "المرفق مش متاح",
      voiceNote: "رسالة صوتية",
      play: "تشغيل",
      pause: "إيقاف",
      imageAlt: "صورة مشتركة",
      loadingImage: "بنحمّل الصورة…",
      loadingVoice: "بنحمّل الرسالة الصوتية…",
      seconds: "{s} ث",
      clickToDownload: "اضغط للتنزيل",
      preparing: "بنجهّز التنزيل…",
      fileFallback: "ملف",
      previewNone: "مفيش رسائل لسه",
      previewPhoto: "📷 صورة",
      previewVoice: "🎤 رسالة صوتية ({s} ث)",
      previewFile: "📄 {name}",
      previewWorkout: "🏋️ خطة تمرين",
      previewNutrition: "🥗 خطة تغذية",
      previewMessage: "رسالة",
      attachmentFailed: "فشل إرسال المرفق",
    },

    recorder: {
      record: "سجّل رسالة صوتية",
      discardRecording: "امسح التسجيل",
      stop: "أوقف التسجيل",
      discard: "امسح",
      send: "ابعت الرسالة الصوتية",
      micDenied: "محتاجين إذن الميكروفون عشان تسجل رسالة صوتية.",
    },
  },
} as const;
