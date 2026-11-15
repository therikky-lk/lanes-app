import { useEffect, useState } from "react";
import { ArrowLeftLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { api, ApiError, type EmailCodePurpose } from "@/shared/api/api";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputStyle = "rounded-[10px]! border-[#71717a]! bg-[#151517]! focus-within:border-white! focus-within:ring-1 focus-within:ring-white [&_input]:text-white! [&_input]:[-webkit-text-fill-color:#fff]! [&_input:-webkit-autofill]:shadow-[0_0_0_1000px_#151517_inset]!";
const fieldStyle = `${inputStyle} h-[48px]! text-[16px]!`;
const labelStyle = "text-[14px] font-medium text-[#f4f4f5]";

type Props = {
  purpose: EmailCodePurpose;
  initialEmail: string;
  onBack: () => void;
  onReset: (email: string) => void;
  onRegister: (verification: { challenge: string; code: string }) => Promise<void>;
};

export default function EmailCodeForm({ purpose, initialEmail, onBack, onReset, onRegister }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail);
  const [issued, setIssued] = useState<{ challenge: string; email: string } | null>(null);
  const [step, setStep] = useState<"request" | "code" | "password">("request");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const reset = purpose === "reset";
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const canReuseCode = Boolean(remaining && issued?.email === email.trim().toLowerCase());

  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, now]);

  const showError = (reason: unknown) => {
    if (reason instanceof ApiError) {
      if (reason.code === "INVALID_EMAIL_CODE") {
        setStep("code");
        setCode("");
        setError(t("login.email_code.invalid"));
        return;
      }
      if (reason.status === 429) {
        setError(t("common.error_too_many"));
        return;
      }
      if (reason.code === "EMAIL_ALREADY_USED" || reason.code === "USERNAME_TAKEN") {
        setError(t(reason.code === "EMAIL_ALREADY_USED" ? "login.errors.email_already_used" : "login.errors.username_taken"));
        return;
      }
    }
    setError(t("login.email_code.failed"));
  };

  const send = async () => {
    if (submitting || (step === "code" && remaining)) return;
    const address = email.trim().toLowerCase();
    if (!emailPattern.test(address) || address.length > 254) {
      setError(t("login.errors.email_invalid"));
      return;
    }
    setError("");
    if (step === "request" && canReuseCode) {
      setStep("code");
      return;
    }
    setSubmitting(true);
    try {
      const receipt = await api.requestEmailCode(purpose, address);
      setEmail(address);
      setIssued({ challenge: receipt.challenge, email: address });
      setStep("code");
      setCode("");
      const sentAt = Date.now();
      setNow(sentAt);
      setResendAt(sentAt + receipt.retryAfter * 1000);
    } catch (reason) {
      showError(reason);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (step === "request") {
      await send();
      return;
    }
    if (!issued || !/^[0-9]{6}$/.test(code)) {
      setError(t("login.email_code.label"));
      return;
    }
    if (reset && step === "code") {
      setError("");
      setStep("password");
      return;
    }
    if (reset && password.length < 8) {
      setError(t("login.errors.password_min_8"));
      return;
    }
    if (reset && password !== confirmation) {
      setError(t("login.errors.password_mismatch"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const verification = { challenge: issued.challenge, code };
      if (reset) {
        await api.resetPassword(issued.email, password, verification);
        onReset(issued.email);
      } else {
        await onRegister(verification);
      }
    } catch (reason) {
      showError(reason);
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setError("");
    if (step === "password") {
      setStep("code");
      return;
    }
    if (reset && step === "code") {
      setCode("");
      setPassword("");
      setConfirmation("");
      setStep("request");
      return;
    }
    onBack();
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-[16px] text-white">
      <h2 className="m-0 text-[22px] font-semibold leading-tight">
        {t(step === "password" ? "login.email_code.new_password" : reset && step === "request" ? "login.email_code.reset" : "login.email_code.verify")}
      </h2>
      {step === "request" && (reset ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="code-email" className={labelStyle}>{t("login.label_email")}</label>
          <TextInput id="code-email" name="email" type="email" autoComplete="email" autoFocus
            value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} className={fieldStyle} />
        </div>
      ) : <p className="m-0 text-sm [overflow-wrap:anywhere] text-[#dedee3]">{email}</p>)}
      {step === "code" && (
        <>
          <p className="m-0 text-[14px] leading-relaxed text-[#dedee3] [overflow-wrap:anywhere]" id="email-code-address" role="status">
            {t(reset ? "login.email_code.sent_reset" : "login.email_code.sent_register", { email: issued?.email ?? email })}
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="email-code" className={labelStyle}>{t("login.email_code.label")}</label>
            <TextInput id="email-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus
              aria-describedby="email-code-address" enterKeyHint="next" placeholder="••••••"
              value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={submitting} className={`${inputStyle} h-[56px]! text-[24px]! [&_input]:text-center [&_input]:[letter-spacing:0.36em]! [&_input]:tabular-nums [&_input::placeholder]:[-webkit-text-fill-color:#a1a1aa]`} />
          </div>
          <button type="button" onClick={() => void send()} disabled={submitting || remaining > 0}
            className="min-h-[32px] self-start text-sm font-medium text-white underline underline-offset-4 disabled:text-[#b4b4bd] disabled:no-underline">
            {remaining ? t("login.email_code.resend_in", { seconds: remaining }) : t("login.email_code.resend")}
          </button>
        </>
      )}
      {step === "password" && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="reset-password" className={labelStyle}>{t("login.label_password")}</label>
            <TextInput id="reset-password" name="new-password" type="password" autoComplete="new-password" autoFocus
              aria-describedby="reset-password-hint" maxLength={128} value={password}
              onChange={(event) => setPassword(event.target.value)} disabled={submitting} className={fieldStyle} />
            <p id="reset-password-hint" className="m-0 text-[13px] leading-snug text-[#dedee3]">{t("login.errors.password_min_8")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="reset-confirmation" className={labelStyle}>{t("login.label_confirm_password")}</label>
            <TextInput id="reset-confirmation" name="password-confirmation" type="password" autoComplete="new-password"
              maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={submitting} className={fieldStyle} />
          </div>
        </>
      )}
      {error && <p role="alert" className="m-0 rounded-[10px] border border-[#a44754] bg-[#3a2127] px-3 py-2 text-sm text-[#ffd7dd]">{error}</p>}
      <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
        <Button type="button" variant="outline" onClick={back} disabled={submitting} aria-label={t("login.btn_back")}
          className="h-auto! min-h-[48px] px-0! bg-[#303035]! text-white! hover:bg-[#3a3a40]!">
          <ArrowLeftLine size={21} aria-hidden="true" />
        </Button>
        <Button type="submit" disabled={submitting} aria-busy={submitting}
          className="h-auto! min-h-[48px] px-3! py-2! bg-[#f4f4f5]! text-[#111113]! text-[15px]! hover:bg-white!">
          {t(step === "request" ? (canReuseCode ? "login.btn_continue" : "login.email_code.send") : step === "password" ? "login.email_code.save" : reset ? "login.btn_continue" : "login.btn_create_account")}
        </Button>
      </div>
    </form>
  );
}
