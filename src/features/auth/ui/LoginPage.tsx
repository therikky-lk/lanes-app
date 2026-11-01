import { isNativeApp } from "@/shared/platform/native";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";
import Select from "@/shared/ui/Select";
import { EyeLine, EyeCloseLine, ArrowLeftLine } from "@mingcute/react";
import WindowControls from "@/features/navigation/ui/WindowControls";
import { useWindowState } from "@/features/navigation/hooks/useWindowState";
import logo from "@/assets/logo.svg";
import AppImage from "@/features/covers/ui/AppImage";
import {
  authErrorMessage,
  getAuthErrorCode,
  useAuthStore,
} from "../store/authStore";
import { useTranslation, LOCALE_OPTIONS } from "@/languages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export default function LoginPage() {
  const navigate = useNavigate();
  // maximized / fullscreen: square, borderless, edge to edge (same as the main app frame)
  const { isEdgeToEdge } = useWindowState();
  const frameShape = isEdgeToEdge ? "rounded-none" : "rounded-5xl";
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const { locale, setLocale, t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectMode = (next: "login" | "register") => {
    if (submitting || next === mode) return;
    setMode(next);
    setRegisterStep(1);
    setError("");
    setConfirmPassword("");
  };

  const resolveErrorMessage = (nextError: unknown): string => {
    const code = getAuthErrorCode(nextError);
    if (code === "server_unavailable")
      return t("login.errors.server_unavailable");
    if (code === "server_error")
      return t("login.errors.server_error");
    if (code === "invalid_credentials")
      return t("login.errors.invalid_credentials");
    if (code === "email_already_used")
      return t("login.errors.email_already_used");
    if (code === "username_taken")
      return t("login.errors.username_taken");
    if (code === "invalid_username")
      return t("login.errors.username_invalid");
    if (code === "invalid_input")
      return t("login.errors.display_name_required");
    return authErrorMessage(nextError);
  };

  const handleStep1Continue = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setError(t("login.errors.email_invalid"));
      return;
    }
    if (password.length < 8) {
      setError(t("login.errors.password_min_8"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("login.errors.password_mismatch"));
      return;
    }
    setError("");

    // Provide friendly suggestions from email prefix if fields are empty
    if (!username) {
      const autoHandle = normalizedEmail
        .split("@")[0]
        ?.replace(/[^a-z0-9_]/g, "")
        .slice(0, 30);
      if (autoHandle && autoHandle.length >= 3) {
        setUsername(autoHandle);
      }
    }
    if (!displayName) {
      const autoName = normalizedEmail.split("@")[0];
      if (autoName) {
        setDisplayName(autoName);
      }
    }

    setRegisterStep(2);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (mode === "login") {
      const normalizedEmail = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        setError(t("login.errors.email_invalid"));
        return;
      }
      if (password.length < 8) {
        setError(t("login.errors.password_min_8"));
        return;
      }
      setSubmitting(true);
      setError("");
      try {
        await login(normalizedEmail, password);
        navigate("/", { replace: true });
      } catch (nextError) {
        setError(resolveErrorMessage(nextError));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // mode === "register"
    if (registerStep === 1) {
      handleStep1Continue();
      return;
    }

    // registerStep === 2
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    if (!USERNAME_RE.test(normalizedUsername)) {
      setError(t("login.errors.username_invalid"));
      return;
    }
    if (!cleanDisplayName) {
      setError(t("login.errors.display_name_required"));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await register(
        normalizedEmail,
        password,
        normalizedUsername,
        cleanDisplayName,
      );
      navigate("/", { replace: true });
    } catch (nextError) {
      const code = getAuthErrorCode(nextError);
      if (code === "email_already_used") {
        setRegisterStep(1);
        setError(t("login.errors.email_already_used"));
      } else {
        setError(resolveErrorMessage(nextError));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${frameShape} ${
        isEdgeToEdge ? "border-0" : "border border-border-primary"
      } bg-black/25 backdrop-blur-[18px]`}
    >
      {!isNativeApp() && <WindowControls variant="glass" />}

      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[12%] -top-[32%] h-[140%] w-[38%] rotate-[28deg] bg-white/[0.025]" />
        <div className="absolute right-[18%] -top-[42%] h-[150%] w-[20%] rotate-[28deg] bg-black/[0.12]" />
        <div className="absolute -right-[8%] top-[35%] h-[110%] w-[28%] rotate-[28deg] bg-white/[0.018]" />
      </div>

      <section className="relative z-10 mx-4 my-auto grid max-h-[calc(100%-32px)] w-full max-w-[780px] grid-cols-1 gap-[10px] overflow-y-auto rounded-[22px] border border-white/[0.04] bg-[#1f1f20]/85 p-[9px] shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative hidden min-h-[378px] flex-col items-start overflow-hidden rounded-[14px] bg-[#303033] px-[28px] py-[24px] text-left md:flex">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute -left-[8px] -top-[112px] select-none text-[420px] font-black leading-none tracking-[-0.12em] text-white/[0.035]">N</span>
            <span className="absolute -right-[48px] -top-[20px] h-[115%] w-[42%] rotate-[-28deg] bg-black/[0.12]" />
            <span className="absolute -bottom-[34%] left-[42%] h-[90%] w-[20%] rotate-[-28deg] bg-white/[0.025]" />
          </div>
          <div className="relative z-10 flex items-center gap-[10px]">
            <AppImage src={logo} alt="" width={32} height={32} className="h-[30px] w-[30px]" priority />
            <span className="text-[17px] font-[600] tracking-[-0.02em] text-white">Lane</span>
          </div>
          <div className="relative z-10 mt-auto mb-auto w-[136px]">
            <Select
              options={LOCALE_OPTIONS}
              value={locale}
              onChange={setLocale}
              align="bottom-left"
              variant="transparent"
              className="!h-[36px] !w-full !rounded-[10px] !border-transparent !bg-[#202022] !text-white hover:!bg-[#28282a]"
              aria-label={t("login.select_language")}
            />
          </div>
          <div className="relative z-10 mt-auto max-w-[255px]">
            <h1 className="m-0 text-[29px] font-[700] leading-[1.08] tracking-[-0.045em] text-white">
              {t("login.auth_title_login")}
            </h1>
            <p className="m-0 mt-[10px] text-[14px] leading-[1.4] text-white/65">
              {t("login.auth_subtitle_login")}
            </p>
          </div>
        </aside>

        <div className="flex min-h-[378px] w-full flex-col justify-center px-[22px] py-[22px] sm:px-[28px] md:px-[26px] md:py-[24px]">
          {/* Compact brand header stays available on phones, where the side panel is hidden. */}
          <div className="mb-[18px] flex shrink-0 items-center gap-[10px] md:hidden">
            <AppImage
              src={logo}
              alt="Lane"
              width={28}
              height={28}
              className="h-[26px] w-[26px]"
              priority
            />
            <span className="text-[16px] font-[600] tracking-[-0.025em] text-white">Lane</span>
            <Select
              options={LOCALE_OPTIONS}
              value={locale}
              onChange={setLocale}
              align="bottom-right"
              variant="transparent"
              className="ml-auto min-w-[120px] !rounded-[10px] !bg-[#202022] !text-white"
              aria-label={t("login.select_language")}
            />
          </div>

          {/* Middle: grows + centers form content */}
          <div className="my-auto flex flex-col justify-center">
            <div className="w-full">
              <div className="mb-[20px] flex gap-[8px]">
                {(
                  [
                    { id: "login", label: t("login.btn_sign_in") },
                    { id: "register", label: t("login.btn_create_account") },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMode(item.id)}
                    className={`h-[38px] flex-1 cursor-pointer rounded-[10px] border-none text-[13px] font-[500] transition-colors duration-150 ${
                      mode === item.id
                        ? "bg-[#d9d9dd] text-[#111111]"
                        : "bg-[#19191a] text-white/70 hover:bg-[#242426] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {mode === "register" && (
                  <motion.div
                    key="step-indicator"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      duration: 0.18,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="overflow-hidden"
                  >
                    <div className="mb-2">
                      <span className="inline-flex items-center rounded-[8px] bg-white/[0.08] px-2.5 py-1 text-[11px] font-[500] text-white/65">
                        {t("login.step_indicator", { step: registerStep, total: 2 })}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {mode === "register" && registerStep === 2 && (
                <div className="mb-[12px] text-[13px] font-[500] text-white/75">
                  {t("login.profile_setup_title")}
                </div>
              )}

              <form noValidate onSubmit={submit} className="flex flex-col">
                <AnimatePresence initial={false}>
                  {mode === "login" || registerStep === 1 ? (
                    <motion.div
                      key="step-credentials"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden flex flex-col"
                    >
                      <label
                        className="mb-[6px] text-[12px] font-[500] text-white/75"
                        htmlFor="auth-email"
                      >
                        {t("login.label_email")}
                      </label>
                      <TextInput
                        id="auth-email"
                        autoFocus
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        autoComplete="email"
                        placeholder={t("login.placeholder_email")}
                        className="!h-[44px] !rounded-[8px] !border-white/15 !bg-[#111112] [&_input]:!text-white [&_input]:placeholder:!text-white/40"
                        value={email}
                        hasError={Boolean(error)}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "auth-form-error" : undefined}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (error) setError("");
                        }}
                        disabled={submitting}
                      />

                      <label
                        className="mb-[6px] mt-[13px] text-[12px] font-[500] text-white/75"
                        htmlFor="auth-password"
                      >
                        {t("login.label_password")}
                      </label>
                      <TextInput
                        id="auth-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        placeholder={
                          mode === "login"
                            ? t("login.placeholder_password")
                            : t("login.placeholder_password_new")
                        }
                        className="!h-[44px] !rounded-[8px] !border-white/15 !bg-[#111112] [&_input]:!text-white [&_input]:placeholder:!text-white/40"
                        value={password}
                        hasError={Boolean(error)}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "auth-form-error" : undefined}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (error) setError("");
                        }}
                        disabled={submitting}
                        rightSlot={
                          <button
                            type="button"
                            aria-label={
                              showPassword
                                ? t("login.hide_password")
                                : t("login.show_password")
                            }
                            onClick={() => setShowPassword((v) => !v)}
                            className="flex h-7 w-7 items-center justify-center rounded-sm text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeCloseLine className="h-4 w-4" />
                            ) : (
                              <EyeLine className="h-4 w-4" />
                            )}
                          </button>
                        }
                      />

                      <AnimatePresence initial={false}>
                        {mode === "register" && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              duration: 0.18,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="overflow-hidden"
                          >
                            <label
                              className="mb-[6px] mt-[13px] block text-[12px] font-[500] text-white/75"
                              htmlFor="auth-confirm"
                            >
                              {t("login.label_confirm_password")}
                            </label>
                            <TextInput
                              id="auth-confirm"
                              type={showConfirmPassword ? "text" : "password"}
                              autoComplete="new-password"
                              placeholder={t("login.placeholder_confirm")}
                              className="!h-[44px] !rounded-[8px] !border-white/15 !bg-[#111112] [&_input]:!text-white [&_input]:placeholder:!text-white/40"
                              value={confirmPassword}
                                    hasError={Boolean(error)}
                              aria-invalid={Boolean(error)}
                              aria-describedby={error ? "auth-form-error" : undefined}
                              onChange={(event) => {
                                setConfirmPassword(event.target.value);
                                if (error) setError("");
                              }}
                              disabled={submitting}
                              rightSlot={
                                <button
                                  type="button"
                                  aria-label={
                                    showConfirmPassword
                                      ? t("login.hide_password")
                                      : t("login.show_password")
                                  }
                                  onClick={() => setShowConfirmPassword((v) => !v)}
                                  className="flex h-7 w-7 items-center justify-center rounded-sm text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer"
                                >
                                  {showConfirmPassword ? (
                                    <EyeCloseLine className="h-4 w-4" />
                                  ) : (
                                    <EyeLine className="h-4 w-4" />
                                  )}
                                </button>
                              }
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step-profile"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden flex flex-col"
                    >
                      <label
                        className="mb-[6px] block text-[12px] font-[500] text-white/75"
                        htmlFor="auth-username"
                      >
                        {t("login.label_username")}
                      </label>
                      <TextInput
                        id="auth-username"
                        autoFocus
                        type="text"
                        autoCapitalize="none"
                        spellCheck={false}
                        autoComplete="username"
                        placeholder={t("login.placeholder_username")}
                        className="!h-[44px] !rounded-[8px] !border-white/15 !bg-[#111112] [&_input]:!text-white [&_input]:placeholder:!text-white/40"
                        value={username}
                        icon={
                          <span className="text-[14px] font-medium text-white/45 select-none">
                            @
                          </span>
                        }
                        hasError={Boolean(error)}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "auth-form-error" : "auth-username-hint"}
                        onChange={(event) => {
                          setUsername(
                            event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                          );
                          if (error) setError("");
                        }}
                        disabled={submitting}
                      />
                      <span
                        id="auth-username-hint"
                        className="mt-1 text-[11px] text-white/45"
                      >
                        {t("login.username_hint")}
                      </span>

                      <label
                        className="mb-[6px] mt-[12px] block text-[12px] font-[500] text-white/75"
                        htmlFor="auth-display-name"
                      >
                        {t("login.label_display_name")}
                      </label>
                      <TextInput
                        id="auth-display-name"
                        type="text"
                        autoComplete="name"
                        placeholder={t("login.placeholder_display_name")}
                        className="!h-[44px] !rounded-[8px] !border-white/15 !bg-[#111112] [&_input]:!text-white [&_input]:placeholder:!text-white/40"
                        value={displayName}
                        hasError={Boolean(error)}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "auth-form-error" : undefined}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          if (error) setError("");
                        }}
                        disabled={submitting}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="min-h-[18px] py-[4px]">
                  <AnimatePresence mode="wait" initial={false}>
                    {error && (
                      <motion.p
                        key={error}
                        id="auth-form-error"
                        role="alert"
                        initial={{ opacity: 0, y: -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="m-0 text-[12px] font-[500] leading-[1.4] text-accent-primary"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Submit / Action buttons */}
                <AnimatePresence initial={false}>
                  {mode === "login" ? (
                    <motion.div
                      key="login-footer"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="mt-[2px] !h-[44px] w-full !rounded-[10px] !bg-[#d9d9dd] !text-[#111111] hover:!bg-[#e4e4e7]"
                      >
                        {submitting ? (
                          <>
                            <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-current border-t-transparent" />
                            <span>{t("login.btn_signing_in")}</span>
                          </>
                        ) : (
                          t("login.btn_sign_in")
                        )}
                      </Button>
                    </motion.div>
                  ) : registerStep === 1 ? (
                    <motion.div
                      key="register-step1-footer"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="mt-[2px] !h-[44px] w-full !rounded-[10px] !bg-[#d9d9dd] !text-[#111111] hover:!bg-[#e4e4e7]"
                      >
                        {t("login.btn_continue")}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="register-step2-footer"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <div className="mt-[2px] flex items-center gap-[10px]">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => {
                            setError("");
                            setRegisterStep(1);
                          }}
                          className="w-[110px] shrink-0 !bg-[#29292b] !text-white hover:!bg-[#333335]"
                        >
                          <ArrowLeftLine className="h-4 w-4" />
                          <span className="relative -left-[1.5px] top-[1px]">{t("login.btn_back")}</span>
                        </Button>
                        <Button
                          type="submit"
                          disabled={submitting}
                          className="flex-1 !h-[44px] !bg-[#d9d9dd] !text-[#111111] hover:!bg-[#e4e4e7]"
                        >
                          {submitting ? (
                            <>
                              <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-current border-t-transparent" />
                              <span>{t("login.btn_creating_account")}</span>
                            </>
                          ) : (
                            t("login.btn_create_account")
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}
