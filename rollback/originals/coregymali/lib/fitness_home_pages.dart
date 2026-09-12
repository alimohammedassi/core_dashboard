import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shimmer/shimmer.dart';
import 'screens/leaderboard_screen.dart';

import 'chat/presentation/screens/chat_list_screen.dart';
import 'features/coach/data/repositories/coach_repository_impl.dart';
import 'features/coach/data/repositories/subscription_repository_impl.dart';
import 'features/coach/presentation/providers/coach_providers.dart';
import 'features/coach/presentation/providers/subscription_providers.dart';
import 'features/coach/presentation/screens/coach_marketplace_screen.dart';
import 'l10n/app_localizations.dart';
import 'profile.dart';
import 'screens/food_scan_screen.dart';
import 'screens/barcode_scan_screen.dart';
import 'screens/nutrition_screen.dart';
import 'screens/text_food_log_screen.dart';
import 'screens/voice_food_log_screen.dart';
import 'screens/workout_screen.dart';
import 'services/stats_service.dart';
import 'screens/notifications_inbox_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'supabase/supabase_config.dart';
import 'services/notification_service.dart';
import 'services/streak_service.dart';
import 'services/supabase_client.dart';
import 'theme/app_colors.dart';
import 'theme/app_text.dart';
import 'widgets/add_food_sheet.dart';
import 'widgets/app_background.dart';
import 'widgets/food_logging_modal.dart';
import 'widgets/pixel_art_icons.dart';
import 'features/health/data/health_service.dart';
import 'features/health/presentation/widgets/today_activity_card.dart';

// ─── Nutrition Defaults (B7 — magic numbers centralized) ─────────────────────
abstract final class NutritionDefaults {
  static const double calories = 2400;
  static const double protein = 140;
  static const double carbs = 250;
  static const double fat = 80;
}

// ─── Interactive Micro-Widgets ────────────────────────────────────────────────

class _InteractiveScaleDetector extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double scaleFactor;

  const _InteractiveScaleDetector({
    required this.child,
    this.onTap,
    this.scaleFactor = 0.96,
  });

  @override
  State<_InteractiveScaleDetector> createState() =>
      _InteractiveScaleDetectorState();
}

class _InteractiveScaleDetectorState extends State<_InteractiveScaleDetector>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: widget.scaleFactor)
        .animate(
          CurvedAnimation(parent: _controller, curve: Curves.easeInOutCubic),
        );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTapDown(TapDownDetails _) {
    if (widget.onTap != null) _controller.forward();
  }

  void _handleTapUp(TapUpDetails _) {
    if (widget.onTap != null) {
      _controller.reverse();
      HapticFeedback.lightImpact();
      widget.onTap!();
    }
  }

  void _handleTapCancel() {
    if (widget.onTap != null) _controller.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _handleTapDown,
      onTapUp: _handleTapUp,
      onTapCancel: _handleTapCancel,
      child: ScaleTransition(scale: _scaleAnimation, child: widget.child),
    );
  }
}

/// Clean soft-rounded white card with subtle outline and soft shadow
class _ModernPlayfulCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double borderRadius;
  final Color? borderColor;

  const _ModernPlayfulCard({
    required this.child,
    this.padding,
    this.borderRadius = 22,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding ?? const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(
          color: borderColor ?? AppColors.borderSubtle,
          width: 1.0,
        ),
        boxShadow: [
          BoxShadow(
            // Home card spec: soft 4%-black elevation on light (blur 12,
            // offset (0,4)); the same token stays deep on graphite.
            color: AppColors.cardShadow,
            blurRadius: 12,
            spreadRadius: 0,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

// ─── Root Scaffold ───────────────────────────────────────────────────────────

class FitnessHomePage extends StatefulWidget {
  const FitnessHomePage({super.key});

  @override
  State<FitnessHomePage> createState() => _FitnessHomePageState();
}

/// Semantic identity of every bottom-navigation destination. Tabs and their
/// screens are both derived from this single enum, so the visible tab list and
/// the IndexedStack children can never drift out of sync again.
enum _TabId { home, nutrition, workout, coaches, profile }

class _FitnessHomePageState extends State<FitnessHomePage> {
  int _currentIndex = 0;

  // B4 — memoize tab lists by locale (recompute only when locale changes)
  String? _cachedLocaleCode;
  List<_TabInfo>? _cachedTabs;
  List<_TabInfo>? _cachedVisibleTabs;

  final GlobalKey<NutritionScreenState> _nutritionScreenKey =
      GlobalKey<NutritionScreenState>();

  void _onNutritionChanged() {
    _nutritionScreenKey.currentState?.refreshAfterExternalSave();
  }

  /// Single source of truth for the destinations that exist in the app.
  /// The bottom bar shows only Home / Nutrition / Profile (see
  /// [_visibleTabsFor]); Workout and Coaches stay here as IndexedStack
  /// children so Home's "Explore app features" cards can still deep-link
  /// into them. The coach Dashboard was removed entirely — it is moving to
  /// a website.
  List<_TabInfo> _tabsFor(AppLocalizations l10n) => [
    _TabInfo(
      id: _TabId.home,
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      label: l10n.navHome,
    ),
    _TabInfo(
      id: _TabId.nutrition,
      icon: Icons.restaurant_outlined,
      activeIcon: Icons.restaurant_rounded,
      label: l10n.navNutrition,
    ),
    _TabInfo(
      id: _TabId.workout,
      icon: Icons.fitness_center_outlined,
      activeIcon: Icons.fitness_center,
      label: l10n.navWorkout,
    ),
    _TabInfo(
      id: _TabId.coaches,
      icon: Icons.people_outline_rounded,
      activeIcon: Icons.people_rounded,
      label: l10n.navCoaches,
    ),
    _TabInfo(
      id: _TabId.profile,
      icon: Icons.person_outline_rounded,
      activeIcon: Icons.person_rounded,
      label: l10n.navProfile,
    ),
  ];

  int _indexOf(List<_TabInfo> tabs, _TabId id) =>
      tabs.indexWhere((t) => t.id == id);

  /// What the bottom bar actually SHOWS — three first-class tabs for every
  /// role. Workout / Coaches / everything else stay reachable from Home's
  /// "Explore app features" strip instead of crowding the bar.
  List<_TabInfo> _visibleTabsFor(AppLocalizations l10n) => [
    _TabInfo(
      id: _TabId.home,
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      label: l10n.navHome,
    ),
    _TabInfo(
      id: _TabId.nutrition,
      icon: Icons.restaurant_outlined,
      activeIcon: Icons.restaurant_rounded,
      label: l10n.navNutrition,
    ),
    _TabInfo(
      id: _TabId.profile,
      icon: Icons.person_outline_rounded,
      activeIcon: Icons.person_rounded,
      label: l10n.navProfile,
    ),
  ];

  Widget _screenFor(_TabInfo tab, List<_TabInfo> tabs) {
    return switch (tab.id) {
      _TabId.home => _HomeScreenCore(
        onNavigate: _onNavigate,
        onNutritionChanged: _onNutritionChanged,
        workoutTabIndex: _indexOf(tabs, _TabId.workout),
        profileTabIndex: _indexOf(tabs, _TabId.profile),
        coachesTabIndex: _indexOf(tabs, _TabId.coaches),
        nutritionTabIndex: _indexOf(tabs, _TabId.nutrition),
      ),
      _TabId.nutrition => NutritionScreen(key: _nutritionScreenKey),
      _TabId.workout => const WorkoutScreen(),
      _TabId.coaches => _buildCoachesScreen(
        onBackToHome: () => _onNavigate(_indexOf(tabs, _TabId.home)),
      ),
      _TabId.profile => ProfilePage(
        onOpenWorkout: () => _onNavigate(_indexOf(tabs, _TabId.workout)),
      ),
    };
  }

  // Subscription notifiers for the Coaches tab, created once per home State.
  // Creating them per rebuild leaked every instance (ChangeNotifierProvider
  // .value never disposes) and reset subscription state on tab switches.
  ActiveSubscriptionNotifier? _activeSubNotifier;
  SubscriptionNotifier? _subNotifier;

  @override
  void dispose() {
    _activeSubNotifier?.dispose();
    _subNotifier?.dispose();
    super.dispose();
  }

  Widget _buildCoachesScreen({VoidCallback? onBackToHome}) {
    _activeSubNotifier ??= ActiveSubscriptionNotifier(
      SubscriptionRepositoryImpl(),
    );
    _subNotifier ??= SubscriptionNotifier(SubscriptionRepositoryImpl());
    final activeSubNotifier = _activeSubNotifier!;
    final subNotifier = _subNotifier!;

    // Defer the fetch out of the build phase — it calls notifyListeners()
    // synchronously, which would mark provider scopes dirty mid-build and
    // throw "setState() called during build".
    WidgetsBinding.instance.addPostFrameCallback((_) {
      activeSubNotifier.fetchActiveSubscription();
    });

    return MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) {
            final n = CoachListNotifier(CoachRepositoryImpl());
            WidgetsBinding.instance.addPostFrameCallback(
              (_) => n.fetchCoaches(),
            );
            return n;
          },
        ),
        ChangeNotifierProvider.value(value: activeSubNotifier),
        ChangeNotifierProvider.value(value: subNotifier),
      ],
      child: CoachMarketplaceScreen(
        embeddedInTabs: true,
        onBackToHome: onBackToHome,
      ),
    );
  }

  void _onNavigate(int index) {
    if (_currentIndex == index) return;
    HapticFeedback.selectionClick();
    setState(() => _currentIndex = index);
  }

  List<_TabInfo> _getTabs(AppLocalizations l10n) {
    final code = l10n.localeName;
    if (_cachedTabs != null && _cachedLocaleCode == code) return _cachedTabs!;
    _cachedLocaleCode = code;
    _cachedTabs = _tabsFor(l10n);
    _cachedVisibleTabs = _visibleTabsFor(l10n);
    return _cachedTabs!;
  }

  List<_TabInfo> _getVisibleTabs(AppLocalizations l10n) {
    final code = l10n.localeName;
    if (_cachedVisibleTabs != null && _cachedLocaleCode == code)
      return _cachedVisibleTabs!;
    // Ensure tabs are cached together
    _getTabs(l10n);
    return _cachedVisibleTabs!;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final tabs = _getTabs(l10n);
    final visibleTabs = _getVisibleTabs(l10n);
    final children = tabs.map((t) => _screenFor(t, tabs)).toList();

    final activeId = tabs[_currentIndex].id;
    final isHome = _currentIndex == _indexOf(tabs, _TabId.home);

    return PopScope(
      canPop: isHome,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _onNavigate(_indexOf(tabs, _TabId.home));
      },
      child: Scaffold(
        extendBody: true,
        resizeToAvoidBottomInset: false,
        backgroundColor: AppColors.background,
        body: AppBackground(
          child: IndexedStack(index: _currentIndex, children: children),
        ),
        bottomNavigationBar: _PlayfulNavBar(
          currentIndex: currentIndex(visibleTabs, activeId),
          onTap: (i) {
            final id = visibleTabs[i].id;
            _onNavigate(_indexOf(tabs, id));
          },
          tabs: visibleTabs,
        ),
      ),
    );
  }

  /// Maps the active destination to an index within the visible bar items.
  /// Non-visible destinations (workout/coaches) fall back to Home so the bar
  /// never highlights nothing while those screens are reachable via Home's
  /// feature strip.
  int currentIndex(List<_TabInfo> visibleTabs, _TabId activeId) {
    final direct = visibleTabs.indexWhere((t) => t.id == activeId);
    return direct == -1 ? 0 : direct;
  }
}

class _TabInfo {
  final _TabId id;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  const _TabInfo({
    required this.id,
    required this.icon,
    required this.activeIcon,
    required this.label,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Playful Bottom Navigation Bar
// ─────────────────────────────────────────────────────────────────────────────

class _PlayfulNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<_TabInfo> tabs;

  const _PlayfulNavBar({
    required this.currentIndex,
    required this.onTap,
    required this.tabs,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Container(
          height: 68,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(color: AppColors.borderSubtle, width: 1.2),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF000000).withValues(alpha: 0.06),
                blurRadius: 20,
                spreadRadius: 0,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: List.generate(tabs.length, (i) {
              final tab = tabs[i];
              final isActive = currentIndex == i;
              // Active-state accent: volt on dark, darkened volt on light.
              final accentColor = AppColors.accent;
              // 10px text can't carry the accent on white (fails AA), so the
              // label uses the AA-safe accent-ink token instead.
              final activeLabelColor = AppColors.onPrimaryContainer;

              return Expanded(
                child: _InteractiveScaleDetector(
                  scaleFactor: 0.88,
                  onTap: () => onTap(i),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 240),
                    curve: Curves.easeOutCubic,
                    margin: const EdgeInsets.symmetric(
                      vertical: 6,
                      horizontal: 3,
                    ),
                    decoration: BoxDecoration(
                      color: isActive
                          ? accentColor.withValues(alpha: 0.12)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(20),
                      border: isActive
                          ? Border.all(
                              color: accentColor.withValues(alpha: 0.35),
                              width: 1.2,
                            )
                          : null,
                      boxShadow: isActive
                          ? [
                              // Volt glow — the active destination should read
                              // as "lit up", the signature of the bar.
                              BoxShadow(
                                color: accentColor.withValues(alpha: 0.22),
                                blurRadius: 14,
                                offset: const Offset(0, 2),
                              ),
                            ]
                          : null,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AnimatedScale(
                          scale: isActive ? 1.15 : 1.0,
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOutBack,
                          child: Icon(
                            isActive ? tab.activeIcon : tab.icon,
                            size: 21,
                            color: isActive
                                ? accentColor
                                : AppColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            tab.label,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: isActive
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                              color: isActive
                                  ? activeLabelColor
                                  : AppColors.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Home Screen Core
// ─────────────────────────────────────────────────────────────────────────────

class _HomeScreenCore extends StatefulWidget {
  final Function(int) onNavigate;
  final VoidCallback? onNutritionChanged;

  /// Resolved by the parent from the active tab list so home-screen shortcuts
  /// land on the right destination.
  final int workoutTabIndex;
  final int profileTabIndex;
  final int coachesTabIndex;
  final int nutritionTabIndex;
  const _HomeScreenCore({
    required this.onNavigate,
    this.onNutritionChanged,
    required this.workoutTabIndex,
    required this.profileTabIndex,
    required this.coachesTabIndex,
    required this.nutritionTabIndex,
  });

  @override
  State<_HomeScreenCore> createState() => _HomeScreenCoreState();
}

class _HomeScreenCoreState extends State<_HomeScreenCore>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  static bool _nudgeShownThisSession = false;

  // B2 — error handling
  bool _hasError = false;

  final StreakService _streakService = StreakService();
  final HealthService _healthService = HealthService();
  StreakStatus _streakStatus = StreakStatus.empty;

  bool _isLoading = true;
  bool _noGoalsSet = false;
  DateTime _selectedDate = DateTime.now();

  Map<String, dynamic> _profile = {};
  Map<String, dynamic>? _goals;
  List<dynamic> _nutritionLogs = [];

  double _totalCalories = 0, _goalCalories = NutritionDefaults.calories;
  double _totalProtein = 0, _goalProtein = NutritionDefaults.protein;
  double _totalCarbs = 0, _goalCarbs = NutritionDefaults.carbs;
  double _totalFat = 0, _goalFat = NutritionDefaults.fat;
  int _waterGlasses = 0;
  int _stepsInt = 0;
  int _caloriesBurned = 0;

  late AnimationController _heroCtrl;
  late AnimationController _staggerCtrl;
  late Animation<double> _ringAnim;
  late Animation<double> _macroAnim;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // OneSignal SDK verification dialog — shown at most once per session
    // right after home paints. Its "Got it" button is the ONLY place the OS
    // notification permission is requested (per OneSignal's integration
    // rules). Waiting for a subscription id first would deadlock on
    // Android 13+, where a real subscription only exists after this
    // dialog grants the permission.
    if (NotificationService.instance.isReady) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _maybeShowPushVerifyDialog(),
      );
    } else {
      // Init is deferred past the first frame now (cold-start time) —
      // catch it the moment it lands.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        NotificationService.ready.addListener(_onNotificationsReady);
        _onNotificationsReady();
      });
    }
    _heroCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
      value: 1.0,
    );
    _ringAnim = CurvedAnimation(
      parent: _heroCtrl,
      curve: const Interval(0.1, 0.85, curve: Curves.easeOutCubic),
    );
    _macroAnim = CurvedAnimation(
      parent: _heroCtrl,
      curve: const Interval(0.3, 1.0, curve: Curves.easeOutCubic),
    );
    _staggerCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
      value: 1.0,
    );
    StreakService.milestoneReached.addListener(_showMilestoneDialog);
    _loadAll();
  }

  void _showMilestoneDialog() {
    final days = StreakService.milestoneReached.value;
    if (days == null || !mounted) return;
    StreakService.milestoneReached.value = null;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🔥', style: TextStyle(fontSize: 34)),
            const SizedBox(height: 16),
            Text(
              '$days-day streak!',
              textAlign: TextAlign.center,
              style: AppText.headlineMd.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Consistency is the real workout. Keep the flame alive!',
              textAlign: TextAlign.center,
              style: AppText.bodySm.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  gradient: AppColors.primaryActionGradient,
                ),
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: TextButton.styleFrom(
                    // Ink on the lime fill — white fails contrast on it.
                    foregroundColor: AppColors.onPrimary,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text('Keep going!'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadAll();
    }
  }

  static const _pushVerifyDialogShownKey = 'push_verify_dialog_shown';
  bool _pushVerifyDialogShown = false;

  /// Runs once NotificationService.init completes (or immediately if it
  /// already has) — the once-per-install dialog gate.
  void _onNotificationsReady() {
    if (!NotificationService.ready.value) return;
    NotificationService.ready.removeListener(_onNotificationsReady);
    if (mounted) _maybeShowPushVerifyDialog();
  }

  Future<void> _maybeShowPushVerifyDialog() async {
    if (_pushVerifyDialogShown || !mounted) return;
    _pushVerifyDialogShown = true;
    // Permission already granted → nothing to ask, never show the dialog.
    if (NotificationService.instance.permissionGranted) return;
    // Show at most ONCE per install (persisted), not once per session —
    // users shouldn't re-dismiss this on every launch.
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_pushVerifyDialogShownKey) ?? false) return;
    await prefs.setBool(_pushVerifyDialogShownKey, true);
    // The callback can fire synchronously from initState when the
    // subscription already exists — dialog needs a completed frame first.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          backgroundColor: AppColors.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: Text(
            l10n?.pushDialogTitle ??
                'Enable notifications',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          content: Text(
            l10n?.pushDialogBody ??
                'Enable notifications so we can remind you about meals, water '
                    'and your daily calorie goal.',
            style: TextStyle(color: AppColors.textSecondary, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                NotificationService.instance.requestPermission();
              },
              child: Text(
                l10n?.pushDialogCta ?? 'Got it',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      );
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    NotificationService.ready.removeListener(_onNotificationsReady);
    StreakService.milestoneReached.removeListener(_showMilestoneDialog);
    _heroCtrl.dispose();
    _staggerCtrl.dispose();
    super.dispose();
  }

  /// Day-precision date comparison used for "is this today?" checks.
  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  /// Quiet smartwatch sync used by [_loadAll] so steps/burned stay fresh
  /// without the old always-visible activity card. Permission-gated and
  /// guarded against zero-fetch overwrites (a revoked-permission or errored
  /// fetch must never wipe values the user entered manually).
  Future<bool> _syncTodayHealthQuietly() async {
    try {
      final status = await _healthService.checkPlatformStatus();
      if (status != HealthPermissionStatus.granted) return false;
      final activity = await _healthService.fetchTodayActivity();
      if (activity.steps <= 0 && activity.activeCaloriesBurned <= 0) {
        return false;
      }
      return await _healthService.syncTodayActivity(activity);
    } catch (e) {
      debugPrint('Quiet health sync skipped: $e');
      return false;
    }
  }

  // Smartwatch connect / sync sheet — hosts the existing activity card so
  // permission requests, install prompts and manual sync stay reachable
  // without a permanent home-section slot.
  void _openWatchSheet() {
    HapticFeedback.lightImpact();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
          child: TodayActivityCard(stepGoal: 10000, onSynced: () => _loadAll()),
        ),
      ),
    );
  }

  Future<void> _loadAll([DateTime? date]) async {
    // Clear error on retry
    if (_hasError) {
      setState(() => _hasError = false);
    }
    final targetDate = date ?? _selectedDate;
    final dateStr = targetDate.toIso8601String().substring(0, 10);

    // Best-effort smartwatch sync before reading today's summary. Hard-capped
    // at 3s so a hung health plugin can never stall home load; runs ahead of
    // the fetches so fresh steps land in daily_summary before we read it.
    if (currentUserId != null && _isSameDay(targetDate, DateTime.now())) {
      try {
        await _syncTodayHealthQuietly().timeout(
          const Duration(seconds: 3),
          onTimeout: () => false,
        );
      } catch (_) {}
    }

    // Streak status — fire-and-forget refresh for the header badge.
    _streakService.getStatus().then((s) {
      if (mounted) setState(() => _streakStatus = s);
    });

    if (currentUserId == null) {
      if (mounted) {
        setState(() => _isLoading = false);
        _heroCtrl.forward(from: 0.0);
        _staggerCtrl.forward(from: 0.0);
      }
      return;
    }

    try {
      final results = await Future.wait<dynamic>([
        supabase
            .from('profiles')
            .select()
            .eq('id', currentUserId!)
            .maybeSingle(),
        supabase
            .from('user_goals')
            .select()
            .eq('user_id', currentUserId!)
            .maybeSingle(),
        supabase
            .from('nutrition_logs')
            .select()
            .eq('user_id', currentUserId!)
            .eq('logged_date', dateStr),
        supabase
            .from('daily_summary')
            .select()
            .eq('user_id', currentUserId!)
            .eq('summary_date', dateStr)
            .maybeSingle(),
      ]);

      if (!mounted) return;
      _profile = (results[0] as Map<String, dynamic>?) ?? {'name': 'Athlete'};
      _goals = results[1] as Map<String, dynamic>?;
      _nutritionLogs = (results[2] as List<dynamic>?) ?? [];
      final summary = results[3] as Map<String, dynamic>?;

      _noGoalsSet = _goals == null;
      _totalCalories = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['calories'] as num?) ?? 0),
      );
      _totalProtein = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['protein_g'] as num?) ?? 0),
      );
      _totalCarbs = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['carbs_g'] as num?) ?? 0),
      );
      _totalFat = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['fat_g'] as num?) ?? 0),
      );

      if (_goals != null) {
        _goalCalories =
            (_goals!['daily_calories'] as num?)?.toDouble() ??
            NutritionDefaults.calories;
        _goalProtein =
            (_goals!['daily_protein_g'] as num?)?.toDouble() ??
            NutritionDefaults.protein;
        _goalCarbs =
            (_goals!['daily_carbs_g'] as num?)?.toDouble() ??
            NutritionDefaults.carbs;
        _goalFat =
            (_goals!['daily_fat_g'] as num?)?.toDouble() ??
            NutritionDefaults.fat;
      }

      if (summary != null) {
        _waterGlasses = summary['water_ml'] != null
            ? ((summary['water_ml'] as num) ~/ 250)
            : 0;
        _stepsInt = (summary['steps'] as num?)?.toInt() ?? 0;
        _caloriesBurned = (summary['calories_burned'] as num?)?.toInt() ?? 0;
      } else {
        _waterGlasses = 0;
        _stepsInt = 0;
        _caloriesBurned = 0;
      }
    } catch (e) {
      debugPrint('Home load error: $e');
      if (mounted) setState(() => _hasError = true);
    } finally {
      if (mounted && _hasError == false) {
        // success — ensure error cleared (already cleared at top, but keep)
      }
      if (mounted) {
        setState(() => _isLoading = false);
        _heroCtrl.forward(from: 0.0);
        _staggerCtrl.forward(from: 0.0);
      }
    }
  }

  Future<void> _openFoodLogger({
    String mealType = 'breakfast',
    String? mode,
  }) async {
    // Log into the day the user is actually viewing, not blindly today.
    final result = await FoodLoggingModal.show(
      context,
      initialMealType: mealType,
      initialMode: mode,
      logDate: _selectedDate,
    );
    if (result == true) {
      await _loadAll();
    }
  }

  // Barcode scanner entry point — same refresh flow as the AI scan.
  Future<void> _openBarcodeScan() async {
    HapticFeedback.lightImpact();
    final saved = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const BarcodeScanScreen()));
    if (saved == true && mounted) {
      await _refreshNutritionTotals();
      widget.onNutritionChanged?.call();
    }
  }

  // Add Meal entry point — opens the Supabase `foods` table browser
  // (search + categories + smart serving). Same refresh flow as AI scan.
  Future<void> _openFoodDatabase() async {
    HapticFeedback.lightImpact();
    final h = DateTime.now().hour;
    final defaultMeal = h < 11
        ? 'breakfast'
        : h < 16
        ? 'lunch'
        : h < 22
        ? 'dinner'
        : 'snack';
    await AddFoodSheet.show(
      context,
      preselectedMeal: defaultMeal,
      onFoodLogged: () async {
        await _refreshNutritionTotals();
        widget.onNutritionChanged?.call();
      },
    );
  }

  // AI Food Scan entry point. On success, refresh only the daily nutrition
  // totals (today's logs + summary) instead of re-fetching everything.
  Future<void> _openFoodScan() async {
    HapticFeedback.lightImpact();
    final saved = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const FoodScanScreen()));
    if (saved == true && mounted) {
      await _refreshNutritionTotals();
      widget.onNutritionChanged?.call();
    }
  }

  // Voice Food Log entry point — same refresh flow as the AI scan.
  Future<void> _openVoiceLog() async {
    HapticFeedback.lightImpact();
    final saved = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const VoiceFoodLogScreen()));
    if (saved == true && mounted) {
      await _refreshNutritionTotals();
      widget.onNutritionChanged?.call();
    }
  }

  // Text Food Log entry point — same refresh flow as the AI scan.
  Future<void> _openTextLog() async {
    HapticFeedback.lightImpact();
    final saved = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const TextFoodLogScreen()));
    if (saved == true && mounted) {
      await _refreshNutritionTotals();
      widget.onNutritionChanged?.call();
    }
  }

  Future<void> _refreshNutritionTotals() async {
    if (currentUserId == null) return;
    final dateStr = _selectedDate.toIso8601String().substring(0, 10);
    try {
      final results = await Future.wait<dynamic>([
        supabase
            .from('nutrition_logs')
            .select()
            .eq('user_id', currentUserId!)
            .eq('logged_date', dateStr),
        supabase
            .from('daily_summary')
            .select()
            .eq('user_id', currentUserId!)
            .eq('summary_date', dateStr)
            .maybeSingle(),
      ]);

      if (!mounted) return;
      _nutritionLogs = (results[0] as List<dynamic>?) ?? [];
      _totalCalories = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['calories'] as num?) ?? 0),
      );
      _totalProtein = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['protein_g'] as num?) ?? 0),
      );
      _totalCarbs = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['carbs_g'] as num?) ?? 0),
      );
      _totalFat = _nutritionLogs.fold(
        0.0,
        (s, l) => s + ((l['fat_g'] as num?) ?? 0),
      );
      setState(() {});
      _heroCtrl.forward(from: 0.0);
      _staggerCtrl.forward(from: 0.0);
    } catch (e) {
      debugPrint('Home nutrition refresh error: $e');
    }
  }

  Future<void> _addWater() async {
    HapticFeedback.lightImpact();
    final newGlasses = (_waterGlasses + 1).clamp(0, 20);
    setState(() => _waterGlasses = newGlasses);
    try {
      await StatsService().updateTodaySummary({'water_ml': newGlasses * 250});
    } catch (e) {
      debugPrint('Error updating water: $e');
    }
  }

  Future<void> _promptUpdateSteps() async {
    final ctrl = TextEditingController(text: '$_stepsInt');
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final result = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Row(
          children: [
            const PixelArtIcon(type: PixelIconType.sneaker, size: 22),
            const SizedBox(width: 12),
            Text(
              isArabic ? 'تسجيل خطوات اليوم' : 'Log Today\'s Steps',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          autofocus: true,
          decoration: InputDecoration(
            hintText: '6000',
            suffixText: isArabic ? 'خطوة' : 'steps',
            filled: true,
            fillColor: AppColors.surfaceContainerHigh,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final steps = int.tryParse(ctrl.text);
              Navigator.pop(ctx, steps);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryGreen,
              foregroundColor: AppColors.onPrimary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(isArabic ? 'حفظ' : 'Save'),
          ),
        ],
      ),
    );

    if (result != null) {
      setState(() => _stepsInt = result);
      await StatsService().updateTodaySummary({'steps': result});
    }
  }

  Widget _shimmerBlock(double height, double radius) => Container(
    height: height,
    decoration: BoxDecoration(
      color: AppColors.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(radius),
    ),
  );

  Widget _buildShimmer() {
    return Shimmer.fromColors(
      baseColor: AppColors.surfaceContainerHigh,
      highlightColor: AppColors.surfaceBright,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 60),
            _shimmerBlock(48, 16),
            const SizedBox(height: 16),
            _shimmerBlock(340, 26), // hero fuel card — first data element
            const SizedBox(height: 12),
            _shimmerBlock(84, 20), // vitals bar
            const SizedBox(height: 16),
            _shimmerBlock(56, 20), // add-meal CTA
            const SizedBox(height: 12),
            Row(
              children: List.generate(
                4,
                (_) => Expanded(
                  child: Center(
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerHigh,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            _shimmerBlock(20, 8), // meals section header
            const SizedBox(height: 12),
            _shimmerBlock(116, 18), // meals feed
          ],
        ),
      ),
    );
  }

  // B2 — error view when load fails before any cached data
  Widget _buildErrorView(AppLocalizations l10n, bool isArabic) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.textMuted),
            const SizedBox(height: 16),
            Text(
              isArabic ? 'تعذّر تحميل البيانات' : 'Couldn\'t load data',
              style: AppText.styledScaleTitleSm(
                isArabic: isArabic,
                color: AppColors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              isArabic
                  ? 'تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'
                  : 'Check your connection and try again.',
              style: AppText.styledScaleBodySm(
                isArabic: isArabic,
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadAll,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: Text(isArabic ? 'إعادة المحاولة' : 'Retry'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryGreen,
                foregroundColor: AppColors.onPrimary,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final bottomInset = MediaQuery.of(context).padding.bottom;

    if (_hasError && _profile.isEmpty) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: _buildErrorView(l10n, isArabic),
      );
    }

    if (_isLoading) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: _buildShimmer(),
      );
    }

    final double calorieProgress = _goalCalories > 0
        ? (_totalCalories / _goalCalories).clamp(0.0, 1.0)
        : 0.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: () async {
          _heroCtrl.reset();
          _staggerCtrl.reset();
          await _loadAll();
        },
        color: AppColors.primaryGreen,
        backgroundColor: AppColors.surface,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          slivers: [
            SliverToBoxAdapter(
              child: SizedBox(height: MediaQuery.of(context).padding.top + 8),
            ),

            // ── 1. Top Greeting, Gamified Badges & Avatar ──
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 0,
                child: _KaleeHeader(
                  profile: _profile,
                  isArabic: isArabic,
                  streakCount: _streakStatus.currentStreak,
                  streakLoggedToday: _streakStatus.loggedToday,
                  onOpenProfile: () =>
                      widget.onNavigate(widget.profileTabIndex),
                  onOpenChat: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const ChatListScreen()),
                    );
                  },
                ),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 16)),

            // A1/A2 — QuickStatsStrip removed: calories → Hero only, steps → Vitals only, protein → Hero macro rows.
            // Hero is now the first data element after the header for visual hierarchy.

            // ── 1b. Streak-at-risk nudge (once per app open) ──
            if (_streakStatus.atRisk && !_nudgeShownThisSession)
              SliverToBoxAdapter(
                child: _StreakAtRiskBanner(
                  streak: _streakStatus.currentStreak,
                  isArabic: isArabic,
                  onDismiss: () =>
                      setState(() => _nudgeShownThisSession = true),
                ),
              ),

            // ── 2. Goals Alert if not set ──
            if (_noGoalsSet)
              SliverToBoxAdapter(
                child: _Stagger(
                  ctrl: _staggerCtrl,
                  index: 1,
                  child: _GoalsOnboardingBanner(
                    isArabic: isArabic,
                    onTap: () => widget.onNavigate(widget.profileTabIndex),
                  ),
                ),
              ),

            // ── 3. Hero Fuel Card — calories gauge, macros & date stepper ──
            // This is the single most important surface on Home: the ring
            // and the calorie count get the most visual weight on the page.
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 2,
                child: _HeroFuelCard(
                  ringAnim: _ringAnim,
                  macroAnim: _macroAnim,
                  calorieProgress: calorieProgress,
                  totalCalories: _totalCalories,
                  goalCalories: _goalCalories,
                  totalProtein: _totalProtein,
                  goalProtein: _goalProtein,
                  totalCarbs: _totalCarbs,
                  goalCarbs: _goalCarbs,
                  totalFat: _totalFat,
                  goalFat: _goalFat,
                  caloriesBurned: _caloriesBurned,
                  selectedDate: _selectedDate,
                  isArabic: isArabic,
                  onSelectDate: (d) {
                    setState(() => _selectedDate = d);
                    _loadAll(d);
                  },
                  onOpenNutrition: () => _openFoodLogger(),
                ),
              ),
            ),

            // 24px between major sections (hero → vitals → hub …), 12px
            // within a section — the eye gets one obvious reading order:
            // calories → macros → vitals → logging actions.
            const SliverToBoxAdapter(child: SizedBox(height: 24)),

            // ── 4. Vitals Bar (Water · Steps · Burned) ──
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 3,
                child: _VitalsBar(
                  waterGlasses: _waterGlasses,
                  steps: _stepsInt,
                  caloriesBurned: _caloriesBurned,
                  isArabic: isArabic,
                  canEditDaily: _isSameDay(_selectedDate, DateTime.now()),
                  onAddWater: _addWater,
                  onStepsTap: _promptUpdateSteps,
                  onWorkoutTap: () => widget.onNavigate(widget.workoutTabIndex),
                  onOpenWatchSheet: _openWatchSheet,
                ),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),

            // ── 5. Quick Food Logging Hub (+ Add Meal & AI Scanner) ──
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 4,
                child: _QuickFoodLogHub(
                  isArabic: isArabic,
                  onAddMeal: _openFoodDatabase,
                  onAiScan: _openFoodScan,
                  onVoice: _openVoiceLog,
                  onText: _openTextLog,
                  onBarcode: _openBarcodeScan,
                ),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),

            // ── 5b. App feature highlights — surfaces the app's other big
            // pillars (coaches, workouts) right on Home so they
            // don't get lost behind the bottom nav.
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 5,
                child: _FeatureHighlightsStrip(
                  isArabic: isArabic,
                  onOpenWorkout: () =>
                      widget.onNavigate(widget.workoutTabIndex),
                  onOpenCoaches: () =>
                      widget.onNavigate(widget.coachesTabIndex),
                  // "Nutrition insights / full calorie details" — land on the
                  // Nutrition tab (analytics), not the add-food logger.
                  onOpenNutrition: () =>
                      widget.onNavigate(widget.nutritionTabIndex),
                  onOpenChat: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ChatListScreen()),
                  ),
                  onOpenRankings: () => Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const LeaderboardScreen()),
                  ),
                ),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),

            // ── 6. Today's Fueling / Meals Feed ──
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 6,
                child: _SectionHeader(
                  title: l10n.todaysFueling,
                  actionText: l10n.addFood,
                  isArabic: isArabic,
                  onAction: () => _openFoodLogger(),
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 12)),
            SliverToBoxAdapter(
              child: _Stagger(
                ctrl: _staggerCtrl,
                index: 7,
                child: _MealsFeed(
                  logs: _nutritionLogs,
                  isArabic: isArabic,
                  onTapMeal: (mealType) => _openFoodLogger(mealType: mealType),
                ),
              ),
            ),

            // Bottom buffer to prevent navbar overlap
            SliverToBoxAdapter(child: SizedBox(height: 90 + bottomInset)),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Top Header with Greeting, Level/XP, Streak & Avatar
// ─────────────────────────────────────────────────────────────────────────────

class _KaleeHeader extends StatelessWidget {
  final Map<String, dynamic> profile;
  final bool isArabic;
  final int streakCount;
  final bool streakLoggedToday;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenChat;

  const _KaleeHeader({
    required this.profile,
    required this.isArabic,
    this.streakCount = 0,
    this.streakLoggedToday = false,
    required this.onOpenProfile,
    required this.onOpenChat,
  });

  String _getGreeting(AppLocalizations l10n) {
    final hour = DateTime.now().hour;
    if (hour < 12) return l10n.goodMorning;
    if (hour < 17) return l10n.goodAfternoon;
    return l10n.goodEvening;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final name = profile['name'] as String? ?? 'Athlete';
    final firstName = name.split(' ').first;
    final avatarUrl = profile['avatar_url'] as String? ?? '';

    final bool isCompactHeader = MediaQuery.sizeOf(context).width < 360;
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: isCompactHeader ? 12 : 20),
      child: Row(
        children: [
          // Avatar with accent border ring
          _InteractiveScaleDetector(
            onTap: onOpenProfile,
            child: Container(
              width: isCompactHeader ? 40 : 46,
              height: isCompactHeader ? 40 : 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.accent, width: 2.2),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accent.withValues(alpha: 0.18),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(2),
              child: ClipOval(
                child: avatarUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: avatarUrl,
                        fit: BoxFit.cover,
                        progressIndicatorBuilder: (context, url, progress) {
                          return Container(
                            color: AppColors.surfaceContainerHigh,
                            child: Center(
                              child: SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  value: progress.progress,
                                  color: AppColors.primaryGreen,
                                ),
                              ),
                            ),
                          );
                        },
                        errorWidget: (context, url, error) {
                          return Container(
                            color: AppColors.lightGreen,
                            child: Center(
                              child: Text(
                                firstName.isNotEmpty
                                    ? firstName[0].toUpperCase()
                                    : 'A',
                                style: TextStyle(
                                  color: AppColors.onPrimaryContainer,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  fontFamily: AppText.fontFamily(
                                    isArabic: isArabic,
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      )
                    : Container(
                        color: AppColors.lightGreen,
                        child: Center(
                          child: Text(
                            firstName.isNotEmpty
                                ? firstName[0].toUpperCase()
                                : 'A',
                            style: TextStyle(
                              color: AppColors.onPrimaryContainer,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              fontFamily: AppText.fontFamily(
                                isArabic: isArabic,
                              ),
                            ),
                          ),
                        ),
                      ),
              ),
            ),
          ),

          SizedBox(width: isCompactHeader ? 8 : 12),

          // Greeting & Name
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        _getGreeting(l10n),
                        style: AppText.styledBodySm(
                          isArabic: isArabic,
                          color: AppColors.textSecondary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Text('👋', style: TextStyle(fontSize: 14)),
                  ],
                ),
                const SizedBox(height: 1),
                Text(
                  firstName,
                  style: AppText.styledHeadlineMd(
                    isArabic: isArabic,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),

          SizedBox(width: isCompactHeader ? 6 : 8),

          // Streak Pill — responsive: scales down via FittedBox, caps width,
          // shows compact count on narrow screens (<360dp) to avoid appbar overflow.
          Flexible(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final bool isNarrow = MediaQuery.sizeOf(context).width < 360;
                final String streakLabel = isNarrow
                    ? '$streakCount'
                    : l10n.daysStreak(streakCount);
                return ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 110),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: isArabic
                        ? Alignment.centerLeft
                        : Alignment.centerRight,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: streakLoggedToday || streakCount == 0
                            ? AppColors.lightGreen
                            : AppColors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: streakLoggedToday
                              ? AppColors.accent.withValues(alpha: 0.4)
                              : AppColors.borderSubtle,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.local_fire_department_rounded,
                            size: 15,
                            // The one place the neon volt still lives (micro-accent).
                            color: streakCount == 0
                                ? AppColors.textMuted
                                : (streakLoggedToday
                                      ? AppColors.volt
                                      : AppColors.textSecondary),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            streakLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: streakCount == 0
                                  ? AppColors.textMuted
                                  : (streakLoggedToday
                                        ? AppColors.onPrimaryContainer
                                        : AppColors.textSecondary),
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              fontFamily: AppText.fontFamily(
                                isArabic: isArabic,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          SizedBox(width: isCompactHeader ? 6 : 8),

          // Notification bell — unread badge from notification_log (Task 7).
          const _NotificationBell(),

          SizedBox(width: isCompactHeader ? 6 : 8),

          // Chat Button — responsive
          _InteractiveScaleDetector(
            onTap: onOpenChat,
            child: Container(
              width: isCompactHeader ? 34 : 38,
              height: isCompactHeader ? 34 : 38,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(
                  isCompactHeader ? 12 : 14,
                ),
                border: Border.all(color: AppColors.borderSubtle),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.cardShadow,
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Icon(
                Icons.chat_bubble_outline_rounded,
                color: AppColors.textPrimary,
                size: isCompactHeader ? 16 : 18,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1a-1. Notification bell (Task 7) — unread badge over notification_log
// ─────────────────────────────────────────────────────────────────────────────

class _NotificationBell extends StatefulWidget {
  const _NotificationBell();

  @override
  State<_NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<_NotificationBell> {
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _loadUnread();
  }

  Future<void> _loadUnread() async {
    final userId = SupabaseConfig.client.auth.currentUser?.id;
    if (userId == null || !mounted) return;
    try {
      // B6 — count query (no row fetch)
      final res = await SupabaseConfig.client
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .filter('read_at', 'is', null)
          .count(CountOption.exact);
      if (!mounted) return;
      setState(() => _unread = res.count);
    } catch (_) {}
  }

  void _openInbox() async {
    HapticFeedback.selectionClick();
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const NotificationsInboxScreen()));
    if (mounted) _loadUnread();
  }

  @override
  Widget build(BuildContext context) {
    final bool isCompact = MediaQuery.sizeOf(context).width < 360;
    return _InteractiveScaleDetector(
      onTap: _openInbox,
      child: Container(
        width: isCompact ? 34 : 38,
        height: isCompact ? 34 : 38,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderSubtle),
          boxShadow: [
            BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(
              Icons.notifications_none_rounded,
              size: 20,
              color: AppColors.textSecondary,
            ),
            if (_unread > 0)
              Positioned(
                top: 5,
                right: 5,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  constraints: const BoxConstraints(minWidth: 15),
                  height: 15,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.error,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _unread > 99 ? '99+' : '$_unread',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b. Streak-at-risk nudge banner
// ─────────────────────────────────────────────────────────────────────────────

class _StreakAtRiskBanner extends StatelessWidget {
  final int streak;
  final bool isArabic;
  final VoidCallback onDismiss;

  const _StreakAtRiskBanner({
    required this.streak,
    required this.isArabic,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 4),
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderSubtle),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(
            Icons.local_fire_department_rounded,
            color: AppColors.volt, // micro-accent: the streak flame
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              isArabic
                  ? 'سجّل أي حاجة النهاردة قبل ما الستريك بتاعك يولّع ($streak أيام)!'
                  : 'Log something today to keep your $streak-day streak alive!',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                height: 1.35,
                color: AppColors.textPrimary,
                fontFamily: AppText.fontFamily(isArabic: isArabic),
              ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: Icon(
              Icons.close_rounded,
              size: 16,
              color: AppColors.textSecondary,
            ),
            onPressed: onDismiss,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Goals Alert Banner
// ─────────────────────────────────────────────────────────────────────────────

class _GoalsOnboardingBanner extends StatelessWidget {
  final bool isArabic;
  final VoidCallback onTap;

  const _GoalsOnboardingBanner({required this.isArabic, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    // A1 — single-line inline alert (not full card), dismissible via tap
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: _InteractiveScaleDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.tertiary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppColors.tertiary.withValues(alpha: 0.35),
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.flag_rounded, size: 16, color: AppColors.tertiary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.setGoalsTitle,
                  style: AppText.styledScaleBodySm(
                    isArabic: isArabic,
                    color: AppColors.tertiary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 12,
                color: AppColors.tertiary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hero Fuel Card — calories gauge, macros & date stepper in one card
// ─────────────────────────────────────────────────────────────────────────────

class _HeroFuelCard extends StatelessWidget {
  final Animation<double> ringAnim;
  final Animation<double> macroAnim;
  final double calorieProgress;
  final double totalCalories, goalCalories;
  final double totalProtein, goalProtein;
  final double totalCarbs, goalCarbs;
  final double totalFat, goalFat;
  final int caloriesBurned;
  final DateTime selectedDate;
  final bool isArabic;
  final ValueChanged<DateTime> onSelectDate;
  final VoidCallback onOpenNutrition;

  const _HeroFuelCard({
    required this.ringAnim,
    required this.macroAnim,
    required this.calorieProgress,
    required this.totalCalories,
    required this.goalCalories,
    required this.totalProtein,
    required this.goalProtein,
    required this.totalCarbs,
    required this.goalCarbs,
    required this.totalFat,
    required this.goalFat,
    required this.caloriesBurned,
    required this.selectedDate,
    required this.isArabic,
    required this.onSelectDate,
    required this.onOpenNutrition,
  });

  bool get _isOver => totalCalories > goalCalories;
  double get _remaining =>
      (_isOver ? totalCalories - goalCalories : goalCalories - totalCalories)
          .abs();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(
            color: _isOver
                ? AppColors.overGoalWarning.withValues(alpha: 0.5)
                : AppColors.accent.withValues(alpha: 0.20),
            width: 1.4,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 12,
              spreadRadius: 0,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            // Header title + Pixel Fire Badge + compact date stepper
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: AppColors.accentCalories.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: const PixelArtIcon(
                    type: PixelIconType.fire,
                    size: 17,
                    animate: true,
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    l10n.todayCalories.toUpperCase(),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      color: AppColors.textSecondary,
                      letterSpacing: 0.9,
                      fontFamily: AppText.fontFamily(isArabic: isArabic),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _HeroDateStepper(
                  selectedDate: selectedDate,
                  isArabic: isArabic,
                  onSelectDate: onSelectDate,
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Gauge & Main Counter — the single largest, most prominent
            // number on the whole home screen.
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Circular Progress Gauge — heavier stroke, accent arc
                SizedBox(
                  width: 124,
                  height: 124,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      AnimatedBuilder(
                        animation: ringAnim,
                        builder: (_, __) => CustomPaint(
                          size: const Size(124, 124),
                          painter: _CalorieGaugePainter(
                            progress: (calorieProgress * ringAnim.value).clamp(
                              0.0,
                              1.0,
                            ),
                            isOver: _isOver,
                          ),
                        ),
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const PixelArtIcon(
                            type: PixelIconType.fire,
                            size: 22,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${((calorieProgress * 100).toInt())}%',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              color: _isOver
                                  ? AppColors.overGoalWarning
                                  : AppColors.onPrimaryContainer,
                              fontFamily: AppText.fontFamily(
                                isArabic: isArabic,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 20),

                // Numbers & Target Info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AnimatedBuilder(
                        animation: ringAnim,
                        builder: (_, __) => Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Text(
                              '${(totalCalories * ringAnim.value).toInt()}',
                              style: TextStyle(
                                // Tier 1 of the hierarchy: the dominant
                                // number on Home — largest and boldest.
                                fontSize: 44,
                                fontWeight: FontWeight.w900,
                                height: 1.0,
                                letterSpacing: -1.0,
                                color: _isOver
                                    ? AppColors.overGoalWarning
                                    : AppColors.textPrimary,
                                fontFamily: AppText.fontFamily(
                                  isArabic: isArabic,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${l10n.kcal} · ${isArabic ? 'الهدف' : 'goal'} ${goalCalories.toInt()}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textSecondary,
                          fontFamily: AppText.fontFamily(isArabic: isArabic),
                        ),
                      ),
                      const SizedBox(height: 8),
                      // Remaining Pill Badge — enlarged so the "how much
                      // is left today" answer is unmissable.
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: _isOver
                              ? AppColors.overGoalWarning.withValues(
                                  alpha: 0.15,
                                )
                              : AppColors.lightGreen,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _isOver
                                  ? Icons.trending_up_rounded
                                  : Icons.check_circle_rounded,
                              size: 13,
                              color: _isOver
                                  ? AppColors.overGoalWarning
                                  : AppColors.onPrimaryContainer,
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                _isOver
                                    ? l10n.caloriesOverMsg(_remaining.toInt())
                                    : l10n.caloriesRemainingMsg(
                                        _remaining.toInt(),
                                      ),
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: _isOver
                                      ? AppColors.overGoalWarning
                                      : AppColors.onPrimaryContainer,
                                  fontFamily: AppText.fontFamily(
                                    isArabic: isArabic,
                                  ),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (caloriesBurned > 0) ...[
                        const SizedBox(height: 8),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.local_fire_department_rounded,
                              size: 12,
                              color: AppColors.textMuted,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              isArabic
                                  ? '$caloriesBurned سعرة محروقة بالتمرين'
                                  : '$caloriesBurned kcal burned from activity',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textMuted,
                                fontFamily: AppText.fontFamily(
                                  isArabic: isArabic,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Macro breakdown — slim rows inside the same card
            Divider(height: 1, thickness: 1, color: AppColors.borderSubtle),
            const SizedBox(height: 16),
            // Gram counts derive from the animated values below so they
            // count up together instead of jumping ahead of the gauge.
            AnimatedBuilder(
              animation: macroAnim,
              builder: (_, __) => Column(
                children: [
                  _MacroRow(
                    label: l10n.protein,
                    icon: Icons.egg_alt_rounded,
                    current: (totalProtein * macroAnim.value).toInt(),
                    goal: goalProtein.toInt(),
                    accentColor: AppColors.accentProtein,
                    isArabic: isArabic,
                  ),
                  const SizedBox(height: 12),
                  _MacroRow(
                    label: l10n.carbs,
                    icon: Icons.rice_bowl_rounded,
                    current: (totalCarbs * macroAnim.value).toInt(),
                    goal: goalCarbs.toInt(),
                    accentColor: AppColors.accentCarbs,
                    isArabic: isArabic,
                  ),
                  const SizedBox(height: 12),
                  _MacroRow(
                    label: l10n.fat,
                    icon: Icons.opacity_rounded,
                    current: (totalFat * macroAnim.value).toInt(),
                    goal: goalFat.toInt(),
                    accentColor: AppColors.accentFat,
                    isArabic: isArabic,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact ‹ date › stepper replacing the old week strip. Range is clamped to
/// the current week (Monday → today), matching the strip's previous reach.
class _HeroDateStepper extends StatelessWidget {
  final DateTime selectedDate;
  final bool isArabic;
  final ValueChanged<DateTime> onSelectDate;

  const _HeroDateStepper({
    required this.selectedDate,
    required this.isArabic,
    required this.onSelectDate,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final selDay = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
    );
    final startOfWeek = today.subtract(Duration(days: today.weekday - 1));
    final canGoBack = selDay.isAfter(startOfWeek);
    final canGoForward = selDay.isBefore(today);

    // The Row auto-reverses under RTL, but chevron glyphs don't — swap them
    // so "earlier" always points against the reading direction.
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final prevIcon = rtl
        ? Icons.chevron_right_rounded
        : Icons.chevron_left_rounded;
    final nextIcon = rtl
        ? Icons.chevron_left_rounded
        : Icons.chevron_right_rounded;

    // Absorb every tap that is not an enabled chevron (the date label, the
    // padding, disabled step buttons) so it can never fall through to the
    // card's open-food-logger handler — the pill only changes the date.
    return GestureDetector(
      onTap: () {},
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _HeroStepButton(
              icon: prevIcon,
              tooltip: l10n.previousDay,
              enabled: canGoBack,
              onTap: () {
                HapticFeedback.selectionClick();
                onSelectDate(selDay.subtract(const Duration(days: 1)));
              },
            ),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 84),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  MaterialLocalizations.of(
                    context,
                  ).formatShortDate(selectedDate),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                    fontFamily: AppText.fontFamily(isArabic: isArabic),
                  ),
                ),
              ),
            ),
            _HeroStepButton(
              icon: nextIcon,
              tooltip: l10n.nextDay,
              enabled: canGoForward,
              onTap: () {
                HapticFeedback.selectionClick();
                onSelectDate(selDay.add(const Duration(days: 1)));
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroStepButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final bool enabled;
  final VoidCallback onTap;

  const _HeroStepButton({
    required this.icon,
    required this.tooltip,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Icon(
              icon,
              size: 17,
              color: enabled
                  ? AppColors.accent
                  : AppColors.textMuted.withValues(alpha: 0.45),
            ),
          ),
      ),
    );
  }
}

/// One slim animated macro progress row rendered inside [_HeroFuelCard].
/// Each macro gets a tinted icon badge so protein/carbs/fat are instantly
/// scannable by color, not just by label text.
class _MacroRow extends StatelessWidget {
  final String label;
  final IconData icon;
  final int current, goal;
  final Color accentColor;
  final bool isArabic;

  const _MacroRow({
    required this.label,
    required this.icon,
    required this.current,
    required this.goal,
    required this.accentColor,
    required this.isArabic,
  });

  @override
  Widget build(BuildContext context) {
    final double pct = goal > 0 ? (current / goal).clamp(0.0, 1.0) : 0.0;

    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: accentColor.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 14, color: accentColor),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textSecondary,
                        fontFamily: AppText.fontFamily(isArabic: isArabic),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  RichText(
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: '$current g',
                          // Numbers stay in ink (AA on white); the bar below
                          // carries the macro's semantic hue.
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                            fontFamily: AppText.fontFamily(isArabic: isArabic),
                          ),
                        ),
                        TextSpan(
                          text: ' / $goal g',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textMuted,
                            fontFamily: AppText.fontFamily(isArabic: isArabic),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 6,
                  // Home spec: the track is the macro's own semantic color
                  // at ~60% opacity; the fill runs at full opacity.
                  backgroundColor: accentColor.withValues(alpha: 0.60),
                  valueColor: AlwaysStoppedAnimation<Color>(accentColor),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CalorieGaugePainter extends CustomPainter {
  final double progress;
  final bool isOver;

  const _CalorieGaugePainter({required this.progress, required this.isOver});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 8;
    // Thicker arc — the ring is the primary progress visual on Home and must
    // carry real weight against the 44px calorie number beside it.
    const strokeWidth = 13.0;

    // Track Background
    final bgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..color = AppColors.surfaceContainerHighest;
    canvas.drawCircle(center, radius, bgPaint);

    if (progress <= 0) return;

    // Active Track with Rounded Cap — volt-family accent per Home spec.
    final activePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = isOver ? AppColors.overGoalWarning : AppColors.accent;

    final sweep = 2 * pi * progress.clamp(0.0, 1.0);
    final rect = Rect.fromCircle(center: center, radius: radius);
    canvas.drawArc(rect, -pi / 2, sweep, false, activePaint);
  }

  @override
  bool shouldRepaint(covariant _CalorieGaugePainter old) =>
      old.progress != progress || old.isOver != isOver;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Vitals Bar — Water · Steps · Burned in one divided card
// ─────────────────────────────────────────────────────────────────────────────

class _VitalsBar extends StatelessWidget {
  final int waterGlasses;
  final int steps;
  final int caloriesBurned;
  final bool isArabic;

  /// False while browsing a past day — water/steps writes always hit *today*,
  /// so the editing affordances hide and the tiles stop being tappable.
  final bool canEditDaily;
  final VoidCallback? onAddWater;
  final VoidCallback? onStepsTap;
  final VoidCallback onWorkoutTap;
  final VoidCallback onOpenWatchSheet;

  const _VitalsBar({
    required this.waterGlasses,
    required this.steps,
    required this.caloriesBurned,
    required this.isArabic,
    required this.canEditDaily,
    this.onAddWater,
    this.onStepsTap,
    required this.onWorkoutTap,
    required this.onOpenWatchSheet,
  });

  String _formatSteps(int steps) =>
      steps >= 1000 ? '${(steps / 1000).toStringAsFixed(1)}k' : '$steps';

  // Progress helpers — canonical goals for circular charts
  double get _waterProgress => (waterGlasses / 8).clamp(0.0, 1.0);
  double get _stepsProgress => (steps / 10000).clamp(0.0, 1.0);
  // Burned goal: 400 kcal active burn is a sensible daily target; visual only.
  double get _burnedProgress => (caloriesBurned / 400).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    // Home spec: three individual card containers with consistent padding
    // replace the old single card with thin divider lines. The ring/icon
    // colors come from the shared data-viz family (water teal, steps gold,
    // burned orange) — one system, distinct but related hues.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _vitalTile(
              isArabic: isArabic,
              onTap: canEditDaily ? onAddWater : null,
              ring: _vitalsRing(
                progress: _waterProgress,
                color: AppColors.accentWater,
                iconType: PixelIconType.waterDrop,
              ),
              label: l10n.water,
              value: '$waterGlasses / 8',
              footer: canEditDaily
                  ? Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.lightGreen,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '+250ml',
                        style: AppText.styledScaleCaption(
                          isArabic: isArabic,
                          color: AppColors.onPrimaryContainer,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 10),
            _vitalTile(
              isArabic: isArabic,
              onTap: canEditDaily ? onStepsTap : null,
              ring: _vitalsRing(
                progress: _stepsProgress,
                color: AppColors.accentSteps,
                iconType: PixelIconType.sneaker,
              ),
              label: l10n.steps,
              value: _formatSteps(steps),
              footer: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (canEditDaily)
                    Icon(
                      Icons.edit_outlined,
                      size: 12,
                      color: AppColors.textMuted,
                    ),
                  if (canEditDaily) const SizedBox(width: 4),
                  Tooltip(
                    message:
                        AppLocalizations.of(context)!.smartwatchSync,
                    child: GestureDetector(
                      onTap: canEditDaily ? onOpenWatchSheet : null,
                      behavior: HitTestBehavior.opaque,
                      child: Padding(
                        padding: const EdgeInsets.all(2),
                        child: Icon(
                          Icons.watch,
                          size: 13,
                          color: AppColors.textSecondary.withValues(
                            alpha: canEditDaily ? 1.0 : 0.4,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            _vitalTile(
              isArabic: isArabic,
              onTap: onWorkoutTap,
              ring: _vitalsRing(
                progress: _burnedProgress,
                color: AppColors.accentWorkout,
                iconType: PixelIconType.dumbbell,
              ),
              label: l10n.burned,
              value: '$caloriesBurned ${l10n.kcal}',
            ),
          ],
        ),
      ),
    );
  }

  /// One stat card: soft-shadow surface container (Home spec shadow —
  /// blur 12 / offset (0,4) via [AppColors.cardShadow]) with the ring,
  /// label, value and optional footer affordance centered inside.
  Widget _vitalTile({
    required bool isArabic,
    required Widget ring,
    required String label,
    required String value,
    required VoidCallback? onTap,
    Widget? footer,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.borderSubtle),
          boxShadow: [
            BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: _InteractiveScaleDetector(
          onTap: onTap,
          scaleFactor: 0.94,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ring,
              const SizedBox(height: 8),
              Text(
                label,
                style: AppText.styledScaleBodySm(
                  isArabic: isArabic,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                  fontFamily: AppText.fontFamily(isArabic: isArabic),
                ),
              ),
              if (footer != null) ...[
                const SizedBox(height: 4),
                footer,
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _vitalsRing({
    required double progress,
    required Color color,
    required PixelIconType iconType,
  }) {
    return SizedBox(
      width: 56,
      height: 56,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: const Size(56, 56),
            painter: _VitalsRingPainter(
              progress: progress,
              color: color,
              trackColor: AppColors.surfaceContainerHighest,
            ),
          ),
          PixelArtIcon(type: iconType, size: 18),
        ],
      ),
    );
  }
}

class _VitalsRingPainter extends CustomPainter {
  final double progress;
  final Color color;
  final Color trackColor;
  const _VitalsRingPainter({
    required this.progress,
    required this.color,
    required this.trackColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    const strokeWidth = 4.5;
    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..color = trackColor
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, bg);
    if (progress <= 0) return;
    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color;
    final sweep = 2 * 3.141592653589793 * progress.clamp(0.0, 1.0);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -3.141592653589793 / 2,
      sweep,
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(covariant _VitalsRingPainter old) =>
      old.progress != progress ||
      old.color != color ||
      old.trackColor != trackColor;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Quick Food Logging Hub (+ Add Meal & AI Scan)
// ─────────────────────────────────────────────────────────────────────────────

class _QuickFoodLogHub extends StatelessWidget {
  final bool isArabic;
  final VoidCallback onAddMeal;
  final VoidCallback onAiScan;
  final VoidCallback onVoice;
  final VoidCallback onText;
  final VoidCallback onBarcode;

  const _QuickFoodLogHub({
    required this.isArabic,
    required this.onAddMeal,
    required this.onAiScan,
    required this.onVoice,
    required this.onText,
    required this.onBarcode,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          // ── AI Scan — secondary action, not the page's focal point.
          // Home spec: outlined/subtle card instead of the full lime
          // gradient fill — ~30% shorter, tinted border, no glow — so it
          // can never outweigh the data cards above it.
          _InteractiveScaleDetector(
            onTap: onAiScan,
            scaleFactor: 0.97,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: AppColors.accent.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    alignment: Alignment.center,
                    child: const PixelArtIcon(
                      type: PixelIconType.robot,
                      size: 20,
                      animate: true,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                l10n.scanAi,
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.onSurface,
                                  fontFamily: AppText.fontFamily(
                                    isArabic: isArabic,
                                  ),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.accent.withValues(
                                  alpha: 0.16,
                                ),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'AI',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1,
                                  color: AppColors.onPrimaryContainer,
                                  fontFamily: AppText.fontFamily(
                                    isArabic: isArabic,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          l10n.aiScanSubtitle,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textSecondary,
                            fontFamily: AppText.fontFamily(isArabic: isArabic),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    Icons.arrow_forward_ios_rounded,
                    size: 15,
                    color: AppColors.accent.withValues(alpha: 0.8),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 12),

          // ── Voice / Text / Barcode — surfaced tiles with visible labels
          // (used to be icon-only 44px circles; AI alternatives deserve
          // scannable, tappable targets).
          Row(
            children: [
              _buildLogModeTile(
                icon: Icons.mic_rounded,
                label: l10n.voiceLog,
                onTap: onVoice,
              ),
              const SizedBox(width: 8),
              _buildLogModeTile(
                icon: Icons.edit_note_rounded,
                label: l10n.quickText,
                onTap: onText,
              ),
              const SizedBox(width: 8),
              _buildLogModeTile(
                icon: Icons.qr_code_scanner_rounded,
                label: l10n.barcodeScan,
                onTap: onBarcode,
              ),
            ],
          ),

          const SizedBox(height: 12),

          // ── Add Meal — quiet secondary path into the food database.
          _InteractiveScaleDetector(
            onTap: onAddMeal,
            scaleFactor: 0.97,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 20),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderSubtle),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.restaurant_rounded,
                    size: 18,
                    color: AppColors.accent,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.addMeal,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                      fontFamily: AppText.fontFamily(isArabic: isArabic),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogModeTile({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: Semantics(
        label: label,
        button: true,
        child: _InteractiveScaleDetector(
          onTap: onTap,
          scaleFactor: 0.93,
          child: Container(
            height: 64,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderSubtle),
              boxShadow: [
                BoxShadow(
                  color: AppColors.cardShadow,
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 21, color: AppColors.accent),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textSecondary,
                    fontFamily: AppText.fontFamily(isArabic: isArabic),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeatureHighlightsStrip extends StatelessWidget {
  final bool isArabic;
  final VoidCallback onOpenWorkout;
  final VoidCallback onOpenCoaches;
  final VoidCallback onOpenNutrition;
  final VoidCallback onOpenChat;
  final VoidCallback onOpenRankings;

  const _FeatureHighlightsStrip({
    required this.isArabic,
    required this.onOpenWorkout,
    required this.onOpenCoaches,
    required this.onOpenNutrition,
    required this.onOpenChat,
    required this.onOpenRankings,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      _FeatureCardData(
        icon: Icons.fitness_center_rounded,
        color: AppColors.accent,
        title: isArabic ? 'التمارين' : 'Workouts',
        subtitle: isArabic ? 'خطتك اليومية' : 'Your daily plan',
        onTap: onOpenWorkout,
      ),
      _FeatureCardData(
        icon: Icons.groups_rounded,
        color: AppColors.tertiaryFixed,
        title: isArabic ? 'المدربين' : 'Coaches',
        subtitle: isArabic ? 'تدريب شخصي' : 'Get personal training',
        onTap: onOpenCoaches,
      ),
      _FeatureCardData(
        icon: Icons.insights_rounded,
        color: AppColors.accentProtein,
        title: isArabic ? 'تحليل التغذية' : 'Nutrition insights',
        subtitle: isArabic ? 'تفاصيل السعرات' : 'Full calorie details',
        onTap: onOpenNutrition,
      ),
      _FeatureCardData(
        icon: Icons.emoji_events_rounded,
        color: const Color(0xFFE8B93E),
        title: isArabic ? 'الترتيب' : 'Rankings',
        subtitle: isArabic ? 'المتصدرون الأسبوعي' : 'Weekly leaderboard',
        onTap: onOpenRankings,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            isArabic ? 'استكشف مميزات التطبيق' : 'Explore app features',
            style: AppText.styledHeadlineSm(
              isArabic: isArabic,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 108,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final item = items[i];
              return _InteractiveScaleDetector(
                onTap: item.onTap,
                  child: Container(
                    width: 132,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.borderSubtle),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cardShadow,
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: item.color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Icon(item.icon, size: 18, color: item.color),
                      ),
                      const Spacer(),
                      Text(
                        item.title,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                          fontFamily: AppText.fontFamily(isArabic: isArabic),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.subtitle,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                          fontFamily: AppText.fontFamily(isArabic: isArabic),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _FeatureCardData {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _FeatureCardData({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Today's Fueling / Meals Feed
// ─────────────────────────────────────────────────────────────────────────────

class _MealsFeed extends StatelessWidget {
  final List<dynamic> logs;
  final bool isArabic;
  final Function(String mealType) onTapMeal;

  const _MealsFeed({
    required this.logs,
    required this.isArabic,
    required this.onTapMeal,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final mealSlots = [
      ('breakfast', l10n.breakfast, PixelIconType.egg, 550.0),
      ('lunch', l10n.lunch, PixelIconType.plate, 750.0),
      ('dinner', l10n.dinner, PixelIconType.apple, 650.0),
      ('snack', l10n.snack, PixelIconType.avocado, 300.0),
    ];

    return SizedBox(
      height: 116,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: mealSlots.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final (type, label, iconType, targetKcal) = mealSlots[i];
          final mLogs = logs.where((l) => l['meal_type'] == type).toList();
          final kcal = mLogs.fold(
            0.0,
            (s, l) => s + ((l['calories'] as num?) ?? 0),
          );
          final hasLogs = mLogs.isNotEmpty;

          return _InteractiveScaleDetector(
            onTap: () => onTapMeal(type),
            child: _ModernPlayfulCard(
              padding: const EdgeInsets.all(12),
              borderRadius: 18,
              borderColor: hasLogs
                  ? AppColors.accent.withValues(alpha: 0.45)
                  : AppColors.borderSubtle,
              child: SizedBox(
                width: 90,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        PixelArtIcon(type: iconType, size: 18),
                        Container(
                          width: 18,
                          height: 18,
                          decoration: BoxDecoration(
                            color: hasLogs
                                ? AppColors.accent
                                : AppColors.surfaceContainerHighest,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            hasLogs ? Icons.check_rounded : Icons.add_rounded,
                            size: 11,
                            color: hasLogs
                                ? AppColors.onPrimary
                                : AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      label,
                      style: AppText.styledLabelLg(
                        isArabic: isArabic,
                        color: AppColors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 1),
                    Text(
                      hasLogs
                          ? '${kcal.toInt()} ${l10n.kcal}'
                          : '${targetKcal.toInt()} ${l10n.kcal}',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: hasLogs
                            ? AppColors.onPrimaryContainer
                            : AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  final String actionText;
  final bool isArabic;
  final VoidCallback? onAction;

  const _SectionHeader({
    required this.title,
    required this.actionText,
    required this.isArabic,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: AppText.styledHeadlineSm(
              isArabic: isArabic,
              color: AppColors.textPrimary,
            ),
          ),
          if (actionText.isNotEmpty && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                actionText,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  // Accent-ink token — AA-safe on the light canvas, unlike
                  // raw accent hues at this size.
                  color: AppColors.onPrimaryContainer,
                  fontFamily: AppText.fontFamily(isArabic: isArabic),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stagger Animation Component
// ─────────────────────────────────────────────────────────────────────────────

class _Stagger extends StatelessWidget {
  final Widget child;
  final int index;
  final AnimationController ctrl;

  const _Stagger({
    required this.child,
    required this.index,
    required this.ctrl,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, c) {
        final start = (index * 0.035).clamp(0.0, 0.6);
        final end = (start + 0.35).clamp(0.0, 1.0);
        final curved = CurvedAnimation(
          parent: ctrl,
          curve: Interval(start, end, curve: Curves.easeOutCubic),
        );
        final val = curved.value;
        return Opacity(
          opacity: val.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, 12 * (1 - val)),
            child: c,
          ),
        );
      },
      child: child,
    );
  }
}
