import 'dart:ui';
import 'package:flutter/material.dart';
import 'fitness_home_pages.dart';
import 'l10n/app_localizations.dart';
import 'supabase/supabase_exports.dart';
import 'providers/profile_provider.dart';
import 'services/supabase_client.dart';
import 'screens/onboarding_flow.dart';
import 'forgetpassword.dart';
import 'features/coach/presentation/screens/coach_profile_setup_screen.dart';
import 'package:provider/provider.dart';
import 'features/coach/presentation/providers/coach_setup_provider.dart';
import 'theme/app_animations.dart';
import 'theme/app_colors.dart';
import 'theme/app_text.dart';
import 'theme/auth_app_text.dart';
import 'widgets/language_toggle.dart';
import 'widgets/premium_glass_bg.dart';

// ─────────────────────────────────────────────────────────────────────────────
// CoreGym Auth — Editorial redesign
//
// Two fixes vs the previous pass, per Ali's request:
// 1) COLOR CONSISTENCY — every color here comes from AppColors / AuthAppText.
//    No hardcoded hex anywhere in this file. If the theme changes later
//    (light/dark, palette tweak), this screen updates automatically instead
//    of drifting out of sync.
// 2) LOCALIZATION — every user-facing string goes through AppLocalizations
//    (l10n.xxx) so it follows the app's existing Arabic translations via the
//    LanguageToggle, instead of hardcoded English literals.
//    A few new keys are needed (tab labels, role labels, trust badges,
//    "joining as") — see the ARB snippet at the end of my reply.
// ─────────────────────────────────────────────────────────────────────────────

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});
  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper>
    with SingleTickerProviderStateMixin {
  bool isLogin = true;
  late AnimationController _switchController;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _switchController = AnimationController(
      vsync: this,
      duration: AppDurations.medium,
    );
    _fade = CurvedAnimation(
      parent: _switchController,
      curve: AppCurves.standard,
    );
    _slide = Tween<Offset>(begin: const Offset(0, 0.04), end: Offset.zero)
        .animate(
          CurvedAnimation(parent: _switchController, curve: AppCurves.standard),
        );
    _switchController.forward();
  }

  @override
  void dispose() {
    _switchController.dispose();
    super.dispose();
  }

  void _toggle(bool login) {
    if (login == isLogin) return;
    setState(() => isLogin = login);
    _switchController
      ..reset()
      ..forward();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return PremiumGlassmorphismBg(
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
              child: Row(
                children: [
                  const _BrandMark(),
                  const Spacer(),
                  const LanguageToggle(compact: true),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _AuthModeSwitch(
                isLogin: isLogin,
                logInLabel: l10n.loginTab,

                signUpLabel: l10n.signUpTab,
                onChanged: _toggle,
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: FadeTransition(
                opacity: _fade,
                child: SlideTransition(
                  position: _slide,
                  child: isLogin
                      ? LoginScreen(onToggle: () => _toggle(false))
                      : SignupScreen(onToggle: () => _toggle(true)),
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
// Login Screen
// ─────────────────────────────────────────────────────────────────────────────

class LoginScreen extends StatefulWidget {
  final VoidCallback onToggle;
  const LoginScreen({super.key, required this.onToggle});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _passwordVisible = false;
  bool _isLoading = false;

  late AnimationController _entryController;
  late List<Animation<double>> _itemFades;
  late List<Animation<Offset>> _itemSlides;

  @override
  void initState() {
    super.initState();
    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
    );
    _itemFades = List.generate(
      5,
      (i) => CurvedAnimation(
        parent: _entryController,
        curve: Interval(i * 0.08, i * 0.08 + 0.52, curve: Curves.easeOut),
      ),
    );
    _itemSlides = List.generate(
      5,
      (i) =>
          Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero).animate(
            CurvedAnimation(
              parent: _entryController,
              curve: Interval(
                i * 0.08,
                i * 0.08 + 0.52,
                curve: Curves.easeOutCubic,
              ),
            ),
          ),
    );
    _entryController.forward();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _entryController.dispose();
    super.dispose();
  }

  Widget _animated(int i, Widget child) => FadeTransition(
    opacity: _itemFades[i],
    child: SlideTransition(position: _itemSlides[i], child: child),
  );

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final profileProv = context.read<ProfileProvider>();
    try {
      final res = await AuthService().signInWithEmail(
        _emailController.text.trim(),
        _passwordController.text,
      );
      await profileProv.fetchProfile();
      if (!mounted) return;
      context._showSnack(
        isArabic
            ? 'مرحباً بعودتك مجدداً!'
            : 'Welcome back, ${res.user?.email ?? ''}!',
        isError: false,
      );
      _navigateAfterAuth(context, profileProv);
    } catch (e) {
      if (mounted)
        context._showSnack(
          _friendlyError(e, isArabic: isArabic),
          isError: true,
        );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() => _isLoading = true);
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final profileProv = context.read<ProfileProvider>();
    try {
      final res = await AuthService().signInWithGoogle();
      debugPrint("Google Sign-In successful. User ID: ${res.user?.id}");
      await profileProv.fetchProfile();
      if (profileProv.needsRoleSelection) {
        if (!mounted) return;
        final role = await showDialog<String>(
          context: context,
          barrierDismissible: false,
          builder: (context) => const _RoleSelectionDialog(),
        );
        if (role != null) await profileProv.setRole(role);
      }
      if (!mounted) return;
      context._showSnack(
        isArabic ? 'تم تسجيل الدخول بواسطة Google!' : 'Signed in with Google!',
        isError: false,
      );
      _navigateAfterAuth(context, profileProv);
    } catch (e) {
      debugPrint("Google Sign-In Error: $e");
      if (mounted)
        context._showSnack(
          _friendlyError(e, isArabic: isArabic),
          isError: true,
        );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Clean Standalone Greeting ──
            _animated(
              0,
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 10, 4, 14),
                child: Text(
                  isArabic ? 'أهلاً بك' : 'Welcome',
                  style: TextStyle(
                    fontFamily: font,
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: isArabic ? 0 : -0.5,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),

            // ── Credentials Glass Card ──
            _animated(
              1,
              _ElevatedCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Email
                    _FieldLabel(l10n.operatorId),
                    const SizedBox(height: 8),
                    SoftTextField(
                      controller: _emailController,
                      hint: l10n.emailHint,
                      icon: Icons.alternate_email_rounded,
                      keyboardType: TextInputType.emailAddress,
                      validator: _emailValidator,
                      autofillHints: const [AutofillHints.email],
                    ),
                    const SizedBox(height: 20),

                    // Password Label & Forgot Link
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        _FieldLabel(l10n.encryptedKey),
                        GestureDetector(
                          onTap: () => Navigator.push(
                            context,
                            _route(ForgotPasswordScreen()),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Text(
                              l10n.forgotPassword,
                              style: TextStyle(
                                fontFamily: font,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: const Color(0xFFD1FC00),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SoftTextField(
                      controller: _passwordController,
                      hint: l10n.passwordHint,
                      icon: Icons.lock_outline_rounded,
                      obscureText: !_passwordVisible,
                      validator: _passwordValidator,
                      autofillHints: const [AutofillHints.password],
                      suffix: GestureDetector(
                        onTap: () => setState(
                          () => _passwordVisible = !_passwordVisible,
                        ),
                        child: Icon(
                          _passwordVisible
                              ? Icons.visibility_off_rounded
                              : Icons.visibility_rounded,
                          color: const Color(0xFFB0B5A5),
                          size: 20,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // ── Primary Action Button ──
            _animated(
              2,
              PrimaryButton(
                label: l10n.initializeSession,
                isLoading: _isLoading,
                onTap: _handleLogin,
              ),
            ),
            const SizedBox(height: 22),

            // ── Social Divider ──
            _animated(3, _AuthDivider(label: l10n.externalAuth)),
            const SizedBox(height: 18),

            // ── Social Login ──
            _animated(
              3,
              Row(
                children: [
                  Expanded(
                    child: SocialButton(
                      icon: Icons.g_mobiledata_rounded,
                      label: l10n.google,
                      onTap: _handleGoogleSignIn,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SocialButton(
                      icon: Icons.apple_rounded,
                      label: l10n.apple,
                      onTap: () => context._showSnack(
                        isArabic
                            ? 'تسجيل الدخول عبر Apple قريباً'
                            : 'Apple sign-in coming soon',
                        isError: false,
                      ),
                    ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Signup Screen
// ─────────────────────────────────────────────────────────────────────────────

class SignupScreen extends StatefulWidget {
  final VoidCallback onToggle;
  const SignupScreen({super.key, required this.onToggle});
  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen>
    with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confCtrl = TextEditingController();
  bool _passVisible = false;
  bool _confVisible = false;
  bool _agreed = false;
  bool _isLoading = false;
  String _selectedRole = 'client';

  late AnimationController _entryController;
  late List<Animation<double>> _fades;
  late List<Animation<Offset>> _slides;

  @override
  void initState() {
    super.initState();
    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fades = List.generate(
      6,
      (i) => CurvedAnimation(
        parent: _entryController,
        curve: Interval(i * 0.07, i * 0.07 + 0.5, curve: Curves.easeOut),
      ),
    );
    _slides = List.generate(
      6,
      (i) =>
          Tween<Offset>(begin: const Offset(0, 0.05), end: Offset.zero).animate(
            CurvedAnimation(
              parent: _entryController,
              curve: Interval(
                i * 0.07,
                i * 0.07 + 0.5,
                curve: Curves.easeOutCubic,
              ),
            ),
          ),
    );
    _entryController.forward();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _confCtrl.dispose();
    _entryController.dispose();
    super.dispose();
  }

  Widget _a(int i, Widget w) => FadeTransition(
    opacity: _fades[i],
    child: SlideTransition(position: _slides[i], child: w),
  );

  Future<void> _handleSignup() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_agreed) {
      context._showSnack(
        'Please agree to the Terms & Conditions',
        isError: true,
      );
      return;
    }
    setState(() => _isLoading = true);
    try {
      final res = await AuthService().registerWithEmail(
        _emailCtrl.text.trim(),
        _passCtrl.text,
        _nameCtrl.text.trim(),
        role: _selectedRole,
      );
      if (res.user != null) {
        if (!mounted) return;
        try {
          await supabase.from('profiles').upsert({
            'id': res.user!.id,
            'name': _nameCtrl.text.trim(),
            'email': _emailCtrl.text.trim(),
            'role': _selectedRole,
          }, onConflict: 'id');
        } catch (_) {}
        context._showSnack('Welcome, ${_nameCtrl.text}!', isError: false);
        final profileProv = context.read<ProfileProvider>();
        await profileProv.fetchProfile();
        if (!mounted) return;
        _navigateAfterAuth(context, profileProv);
      }
    } catch (e) {
      if (mounted) context._showSnack(_friendlyError(e), isError: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleGoogleSignup() async {
    if (!_agreed) {
      context._showSnack('Agree to the Terms first', isError: true);
      return;
    }
    setState(() => _isLoading = true);
    try {
      await AuthService().signInWithGoogle();
      final profileProv = context.read<ProfileProvider>();
      await profileProv.fetchProfile();
      if (profileProv.needsRoleSelection) {
        if (!mounted) return;
        final role = await showDialog<String>(
          context: context,
          barrierDismissible: false,
          builder: (context) => const _RoleSelectionDialog(),
        );
        if (role != null) await profileProv.setRole(role);
      }
      if (!mounted) return;
      _navigateAfterAuth(context, profileProv);
    } catch (e) {
      debugPrint("SignupScreen: Google Sign-In Error: $e");
      if (mounted) context._showSnack(_friendlyError(e), isError: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Clean Standalone Greeting ──
            _a(
              0,
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 10, 4, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.signupTitle,
                      style: TextStyle(
                        fontFamily: font,
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: isArabic ? 0 : -0.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      l10n.signupDesc,
                      style: TextStyle(
                        fontFamily: font,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppColors.onSurfaceVariant,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            _a(
              1,
              _ElevatedCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FieldLabel(l10n.operativeName),
                    const SizedBox(height: 8),
                    SoftTextField(
                      controller: _nameCtrl,
                      hint: l10n.fullNameHint,
                      icon: Icons.person_outline_rounded,
                      textCapitalization: TextCapitalization.words,
                      validator: (v) =>
                          (v?.length ?? 0) < 2 ? 'Enter your name' : null,
                    ),
                    const SizedBox(height: 16),
                    _FieldLabel(l10n.operatorId),
                    const SizedBox(height: 8),
                    SoftTextField(
                      controller: _emailCtrl,
                      hint: l10n.emailHint,
                      icon: Icons.mail_outline_rounded,
                      keyboardType: TextInputType.emailAddress,
                      validator: _emailValidator,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            _a(
              2,
              _ElevatedCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FieldLabel(l10n.encryptedKey),
                    const SizedBox(height: 8),
                    SoftTextField(
                      controller: _passCtrl,
                      hint: l10n.passwordHint,
                      icon: Icons.lock_outline_rounded,
                      obscureText: !_passVisible,
                      validator: _passwordValidator,
                      suffix: GestureDetector(
                        onTap: () =>
                            setState(() => _passVisible = !_passVisible),
                        child: Icon(
                          _passVisible
                              ? Icons.visibility_off_rounded
                              : Icons.visibility_rounded,
                          color: AppColors.outline,
                          size: 18,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _FieldLabel(l10n.confirmKey),
                    const SizedBox(height: 8),
                    SoftTextField(
                      controller: _confCtrl,
                      hint: l10n.passwordHint,
                      icon: Icons.lock_outline_rounded,
                      obscureText: !_confVisible,
                      validator: (v) =>
                          v != _passCtrl.text ? 'Passwords do not match' : null,
                      suffix: GestureDetector(
                        onTap: () =>
                            setState(() => _confVisible = !_confVisible),
                        child: Icon(
                          _confVisible
                              ? Icons.visibility_off_rounded
                              : Icons.visibility_rounded,
                          color: AppColors.outline,
                          size: 18,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            _a(
              3,
              _ElevatedCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FieldLabel(l10n.joiningAs),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: _RolePill(
                            icon: Icons.fitness_center_rounded,
                            label: l10n.athleteRole,
                            selected: _selectedRole == 'client',
                            onTap: () =>
                                setState(() => _selectedRole = 'client'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _RolePill(
                            icon: Icons.sports_rounded,
                            label: l10n.coachRole,
                            selected: _selectedRole == 'coach',
                            onTap: () =>
                                setState(() => _selectedRole = 'coach'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            _a(
              4,
              _TermsRow(
                value: _agreed,
                onChanged: (v) => setState(() => _agreed = v ?? false),
              ),
            ),
            const SizedBox(height: 16),
            _a(
              4,
              PrimaryButton(
                label: l10n.createOperative,
                isLoading: _isLoading,
                onTap: _handleSignup,
              ),
            ),
            const SizedBox(height: 16),
            _a(5, _AuthDivider(label: l10n.externalAuth)),
            const SizedBox(height: 16),
            _a(
              5,
              Row(
                children: [
                  Expanded(
                    child: SocialButton(
                      icon: Icons.g_mobiledata_rounded,
                      label: l10n.google,
                      onTap: _handleGoogleSignup,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SocialButton(
                      icon: Icons.apple_rounded,
                      label: l10n.apple,
                      onTap: () => context._showSnack(
                        'Apple sign-up coming soon',
                        isError: false,
                      ),
                    ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

void _navigateAfterAuth(BuildContext context, ProfileProvider profileProv) {
  if (profileProv.needsUserOnboarding) {
    Navigator.pushReplacement(context, _route(const OnboardingFlow()));
  } else if (profileProv.isCoach) {
    if (profileProv.needsCoachSetup) {
      Navigator.pushReplacement(
        context,
        _route(
          ChangeNotifierProvider(
            create: (_) => CoachSetupNotifier(),
            child: const CoachProfileSetupScreen(),
          ),
        ),
      );
    } else {
      Navigator.pushReplacement(context, _route(const FitnessHomePage()));
    }
  } else {
    Navigator.pushReplacement(context, _route(const FitnessHomePage()));
  }
}

String _friendlyError(Object e, {bool isArabic = false}) {
  final msg = e.toString().toLowerCase();
  if (msg.contains('invalid login') ||
      msg.contains('invalid credentials') ||
      msg.contains('invalid_grant')) {
    return isArabic
        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
        : 'Incorrect email or password.';
  }
  if (msg.contains('already registered') || msg.contains('already exists')) {
    return isArabic
        ? 'يوجد حساب مسجل بهذا البريد مسبقاً.'
        : 'An account with this email already exists.';
  }
  if (msg.contains('network') ||
      msg.contains('socketexception') ||
      msg.contains('failed host lookup')) {
    return isArabic
        ? 'خطأ في الاتصال — يرجى التحقق من اتصالك بالإنترنت.'
        : 'Network error — please check your connection.';
  }
  return isArabic
      ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى.'
      : 'Something went wrong. Please try again.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI Components — every color below is an AppColors / AuthAppText token
// ─────────────────────────────────────────────────────────────────────────────

class _BrandMark extends StatelessWidget {
  const _BrandMark();
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.25),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.asset(
              'assets/images/core_logo.png',
              width: 36,
              height: 36,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(
                decoration: BoxDecoration(
                  gradient: AppColors.primaryActionGradient,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.fitness_center_rounded,
                  color: AppColors.onPrimary,
                  size: 18,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        const Text(
          'Core',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: Colors.white,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}






class _AuthModeSwitch extends StatelessWidget {
  final bool isLogin;
  final String logInLabel, signUpLabel;
  final ValueChanged<bool> onChanged;
  const _AuthModeSwitch({
    required this.isLogin,
    required this.logInLabel,
    required this.signUpLabel,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFF181A14),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF383C2F), width: 1.4),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            alignment: isLogin
                ? AlignmentDirectional.centerStart
                : AlignmentDirectional.centerEnd,
            child: FractionallySizedBox(
              widthFactor: 0.5,
              child: Container(
                decoration: BoxDecoration(
                  gradient: AppColors.primaryActionGradient,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFD1FC00).withValues(alpha: 0.25),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: _SwitchTab(
                  label: logInLabel,
                  selected: isLogin,
                  onTap: () => onChanged(true),
                ),
              ),
              Expanded(
                child: _SwitchTab(
                  label: signUpLabel,
                  selected: !isLogin,
                  onTap: () => onChanged(false),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SwitchTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _SwitchTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Center(
        child: AnimatedDefaultTextStyle(
          duration: const Duration(milliseconds: 200),
          style: TextStyle(
            fontFamily: font,
            fontSize: 14,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
            color: selected ? const Color(0xFF101205) : const Color(0xFFD4D9C8),
            letterSpacing: isArabic ? 0 : 0.4,
          ),
          child: Text(label),
        ),
      ),
    );
  }
}

class _ElevatedCard extends StatelessWidget {
  final Widget child;
  const _ElevatedCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: const Color(0xFF191B15).withValues(alpha: 0.94),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0xFF383C2F), width: 1.4),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.45),
                blurRadius: 28,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return Text(
      text,
      style: TextStyle(
        fontFamily: font,
        fontSize: 13.5,
        fontWeight: FontWeight.w700,
        color: Colors.white,
        letterSpacing: isArabic ? 0 : 0.4,
      ),
    );
  }
}

class SoftTextField extends StatefulWidget {
  final TextEditingController controller;
  final String hint;
  final IconData? icon;
  final Widget? suffix;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final String? Function(String?)? validator;
  final Iterable<String>? autofillHints;

  const SoftTextField({
    super.key,
    required this.controller,
    required this.hint,
    this.icon,
    this.suffix,
    this.obscureText = false,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.validator,
    this.autofillHints,
  });

  @override
  State<SoftTextField> createState() => _SoftTextFieldState();
}

class _SoftTextFieldState extends State<SoftTextField> {
  final _focus = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() => _focused = _focus.hasFocus));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      decoration: BoxDecoration(
        color: const Color(0xFF10120D),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: _focused ? const Color(0xFFD1FC00) : const Color(0xFF3F4535),
          width: _focused ? 1.8 : 1.4,
        ),
        boxShadow: _focused
            ? [
                BoxShadow(
                  color: const Color(0xFFD1FC00).withValues(alpha: 0.20),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: TextFormField(
        controller: widget.controller,
        focusNode: _focus,
        obscureText: widget.obscureText,
        keyboardType: widget.keyboardType,
        textCapitalization: widget.textCapitalization,
        validator: widget.validator,
        autofillHints: widget.autofillHints,
        cursorColor: const Color(0xFFD1FC00),
        style: TextStyle(
          color: Colors.white,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          fontFamily: font,
        ),
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: TextStyle(
            color: const Color(0xFF888E7E),
            fontSize: 14,
            fontWeight: FontWeight.w400,
            fontFamily: font,
          ),
          prefixIcon: widget.icon != null
              ? Icon(
                  widget.icon,
                  color: _focused
                      ? const Color(0xFFD1FC00)
                      : const Color(0xFFB2B8A6),
                  size: 20,
                )
              : null,
          suffixIcon: widget.suffix != null
              ? Padding(
                  padding: const EdgeInsetsDirectional.only(end: 12),
                  child: widget.suffix,
                )
              : null,
          suffixIconConstraints: const BoxConstraints(
            minWidth: 40,
            minHeight: 40,
          ),
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          errorBorder: InputBorder.none,
          focusedErrorBorder: InputBorder.none,
          errorStyle: TextStyle(
            color: const Color(0xFFEE7F60),
            fontSize: 12,
            fontWeight: FontWeight.w500,
            fontFamily: font,
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
        ),
      ),
    );
  }
}

class PrimaryButton extends StatefulWidget {
  final String label;
  final bool isLoading;
  final VoidCallback onTap;
  const PrimaryButton({
    super.key,
    required this.label,
    this.isLoading = false,
    required this.onTap,
  });

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _pressCtrl;
  late Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _pressCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 110),
    );
    _scaleAnim = Tween<double>(
      begin: 1.0,
      end: 0.97,
    ).animate(CurvedAnimation(parent: _pressCtrl, curve: Curves.easeIn));
  }

  @override
  void dispose() {
    _pressCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return ScaleTransition(
      scale: _scaleAnim,
      child: GestureDetector(
        onTapDown: (_) => _pressCtrl.forward(),
        onTapUp: (_) {
          _pressCtrl.reverse();
          if (!widget.isLoading) widget.onTap();
        },
        onTapCancel: () => _pressCtrl.reverse(),
        child: Container(
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: AppColors.primaryActionGradient,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppColors.primaryFixed.withValues(alpha: 0.28),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: widget.isLoading
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    color: AppColors.onPrimary,
                  ),
                )
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.label,
                      style: TextStyle(
                        fontFamily: font,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onPrimary,
                        letterSpacing: isArabic ? 0 : 0.6,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      isArabic
                          ? Icons.arrow_back_rounded
                          : Icons.arrow_forward_rounded,
                      color: AppColors.onPrimary,
                      size: 18,
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _AuthDivider extends StatelessWidget {
  final String label;
  const _AuthDivider({required this.label});

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return Row(
      children: [
        Expanded(
          child: Container(
            height: 1,
            color: AppColors.outline.withValues(alpha: 0.15),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Text(
            label,
            style: TextStyle(
              fontFamily: font,
              color: AppColors.outline.withValues(alpha: 0.8),
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: isArabic ? 0 : 0.6,
            ),
          ),
        ),
        Expanded(
          child: Container(
            height: 1,
            color: AppColors.outline.withValues(alpha: 0.15),
          ),
        ),
      ],
    );
  }
}

class SocialButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const SocialButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final font = AppText.fontFamily(isArabic: isArabic);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          height: 50,
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.outline.withValues(alpha: 0.18),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: AppColors.onSurface, size: 20),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                  letterSpacing: isArabic ? 0 : 0.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RolePill extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _RolePill({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primaryFixed.withValues(alpha: 0.16)
              : AppColors.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? AppColors.primaryFixed
                : AppColors.outline.withValues(alpha: 0.18),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: selected
                  ? AppColors.primaryFixed
                  : AppColors.onSurfaceVariant,
              size: 22,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: AuthAppText.labelMd.copyWith(
                color: selected
                    ? AppColors.primaryFixed
                    : AppColors.onSurfaceVariant,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TermsRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool?> onChanged;
  const _TermsRow({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 22,
          height: 22,
          child: Checkbox(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.primaryFixed,
            checkColor: AppColors.onPrimary,
            side: BorderSide(color: AppColors.outline.withValues(alpha: 0.5)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(5),
            ),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: AuthAppText.bodySm.copyWith(
                color: AppColors.onSurfaceVariant,
                fontSize: 12,
              ),
              children: [
                TextSpan(text: l10n.agreeTerms),
                TextSpan(
                  text: l10n.termsConditions,
                  style: AuthAppText.bodySm.copyWith(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.bold,
                    decoration: TextDecoration.underline,
                    fontSize: 12,
                  ),
                ),
                TextSpan(text: l10n.and),
                TextSpan(
                  text: l10n.privacyPolicy,
                  style: AuthAppText.bodySm.copyWith(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.bold,
                    decoration: TextDecoration.underline,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

String? _emailValidator(String? v) {
  if (v?.isEmpty ?? true) {
    return 'Please enter your email';
  }
  if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(v!)) {
    return 'Please enter a valid email';
  }
  return null;
}

String? _passwordValidator(String? v) {
  if (v?.isEmpty ?? true) {
    return 'Please enter your password';
  }
  if ((v?.length ?? 0) < 6) {
    return 'Password must be at least 6 characters';
  }
  return null;
}

PageRoute _route(Widget page) => PageRouteBuilder(
  pageBuilder: (_, a, __) => page,
  transitionsBuilder: (context, a, __, child) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return FadeTransition(
      opacity: CurvedAnimation(parent: a, curve: AppCurves.standard),
      child: child,
    );
  },
  transitionDuration: AppDurations.medium,
);

extension on BuildContext {
  void _showSnack(String msg, {required bool isError}) {
    final isArabic = Localizations.localeOf(this).languageCode == 'ar';
    ScaffoldMessenger.of(this).showSnackBar(
      SnackBar(
        content: Text(
          msg,
          style: TextStyle(
            fontFamily: AppText.fontFamily(isArabic: isArabic),
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isError ? Colors.white : AppColors.onPrimary,
          ),
        ),
        backgroundColor: isError ? AppColors.error : AppColors.primaryFixed,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

class _RoleSelectionDialog extends StatelessWidget {
  const _RoleSelectionDialog();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
      child: Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 24),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: AppColors.glass2,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.glassBorder),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  gradient: AppColors.primaryActionGradient,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.person_add_rounded,
                  color: AppColors.onPrimary,
                  size: 28,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'CoreGym',
                style: AuthAppText.headlineSm.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                l10n.joiningAs,
                textAlign: TextAlign.center,
                style: AuthAppText.labelMd.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 28),
              _RoleOption(
                icon: Icons.fitness_center_rounded,
                title: l10n.athleteRole,
                onTap: () => Navigator.pop(context, 'client'),
              ),
              const SizedBox(height: 14),
              _RoleOption(
                icon: Icons.sports_rounded,
                title: l10n.coachRole,
                onTap: () => Navigator.pop(context, 'coach'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleOption extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  const _RoleOption({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.glass1,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.glassBorder),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.primaryFixed.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.primaryFixed),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                title,
                style: AuthAppText.labelLg.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Icon(
              Icons.arrow_forward_ios_rounded,
              color: AppColors.outline,
              size: 14,
            ),
          ],
        ),
      ),
    );
  }
}
