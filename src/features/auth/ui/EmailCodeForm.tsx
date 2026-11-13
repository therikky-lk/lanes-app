import { useEffect, useState } from "react";
import { useTranslation } from "@/languages";
import { api, ApiError, type EmailCodePurpose } from "@/shared/api/api";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputStyle = "!h-[44px] !rounded-[8px] !border-white/15 !bg-[#111112] [&_input]:!text-white";
const primaryStyle = "!h-[44px] !rounded-[10px] !bg-[#d9d9dd] !text-[#111111] hover:!bg-[#e4e4e7]";

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
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const reset = purpose === "reset";
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, now]);

  const showError = (reason: unknown) => {
    if (reason instanceof ApiError) {
      if (reason.code === "INVALID_EMAIL_CODE") {
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
    if (submitting || remaining) return;
    const address = email.trim().toLowerCase();
    if (!emailPattern.test(address) || address.length > 254) {
      setError(t("login.errors.email_invalid"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const receipt = await api.requestEmailCode(purpose, address);
      setEmail(address);
      setChallenge(receipt.challenge);
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
    if (!challenge) {
      await send();
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      setError(t("login.email_code.invalid"));
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
      const verification = { challenge, code };
      if (reset) {
        await api.resetPassword(email, password, verification);
        onReset(email);
      } else {
        await onRegister(verification);
      }
    } catch (reason) {
      showError(reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 text-white">
      <h2 className="m-0 text-lg font-semibold">{t(reset ? "login.email_code.reset" : "login.email_code.verify")}</h2>
      {challenge || !reset ? (
        <p className="m-0 break-all text-sm text-white/70" role="status">
          {challenge ? t(reset ? "login.email_code.sent_reset" : "login.email_code.sent_register", { email }) : email}
        </p>
      ) : (
        <>
          <label htmlFor="code-email" className="text-xs text-white/75">{t("login.label_email")}</label>
          <TextInput id="code-email" name="email" type="email" autoComplete="email" autoFocus
            value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} className={inputStyle} />
        </>
      )}
      {challenge && (
        <>
          <label htmlFor="email-code" className="text-xs text-white/75">{t("login.email_code.label")}</label>
          <TextInput id="email-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus
            value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={submitting} className={inputStyle} />
          {reset && (
            <>
              <label htmlFor="reset-password" className="text-xs text-white/75">{t("login.email_code.new_password")}</label>
              <TextInput id="reset-password" name="new-password" type="password" autoComplete="new-password"
                maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} className={inputStyle} />
              <label htmlFor="reset-confirmation" className="text-xs text-white/75">{t("login.label_confirm_password")}</label>
              <TextInput id="reset-confirmation" type="password" autoComplete="new-password"
                maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={submitting} className={inputStyle} />
            </>
          )}
          <button type="button" onClick={() => void send()} disabled={submitting || remaining > 0}
            className="self-start text-sm text-white/80 hover:text-white disabled:text-white/45">
            {remaining ? t("login.email_code.resend_in", { seconds: remaining }) : t("login.email_code.resend")}
          </button>
        </>
      )}
      {error && <p role="alert" className="m-0 text-sm text-accent-primary">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}
          className="!bg-[#29292b] !text-white hover:!bg-[#333335]">{t("login.btn_back")}</Button>
        <Button type="submit" disabled={submitting} aria-busy={submitting} className={primaryStyle + " flex-1"}>
          {t(!challenge ? "login.email_code.send" : reset ? "login.email_code.save" : "login.btn_create_account")}
        </Button>
      </div>
    </form>
  );
}
