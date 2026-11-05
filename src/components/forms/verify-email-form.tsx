"use client";

import { CircleCheckIcon, MailIcon, TimerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import {
  clockOffsetMs,
  deriveTimers,
  formatCountdown,
  isValidOtp,
  OTP_LENGTH,
  type VerificationApiResponse,
  type VerificationChallenge,
  type VerificationErrorKey,
  type VerificationPhase,
} from "@/lib/auth/email-verification";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type Notice = "codeSent" | "unverified" | null;

/** The same code screen serves invite verification and password reset. */
export type VerificationFlow = "invite" | "passwordReset";

const FLOWS = {
  invite: {
    statusPath: "/api/auth/verify-email-otp",
    verifyPath: "/api/auth/verify-email-otp",
    resendPath: "/api/auth/send-verification-otp",
    nextHref: "/accept-invitation",
    // Wording that differs from auth.verifyEmail lives in this namespace.
    overrides: null,
  },
  passwordReset: {
    statusPath: "/api/auth/password-reset-otp",
    verifyPath: "/api/auth/password-reset-otp",
    resendPath: "/api/auth/send-password-reset-otp",
    nextHref: "/reset-password",
    overrides: "auth.forgotVerify",
  },
} as const;

async function callApi(input: string, init?: RequestInit): Promise<VerificationApiResponse> {
  try {
    const response = await fetch(input, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as VerificationApiResponse | null;
    if (data && (data.status === "success" || data.status === "error")) return data;
    return { status: "error", error: "generic" };
  } catch {
    return { status: "error", error: "network" };
  }
}

export function VerifyEmailForm({
  email,
  reason,
  flow = "invite",
}: {
  email: string | null;
  reason: string | null;
  flow?: VerificationFlow;
}) {
  const config = FLOWS[flow];
  const base = useTranslations("auth.verifyEmail");
  const override = useTranslations(config.overrides ?? "auth.verifyEmail");
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      config.overrides && override.has(key) ? override(key, values) : base(key, values),
    [base, override, config.overrides],
  );
  const router = useRouter();

  const [phase, setPhase] = useState<VerificationPhase>(email ? "IDLE" : "ERROR");
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [error, setError] = useState<VerificationErrorKey | null>(email ? null : "notFound");
  const [notice, setNotice] = useState<Notice>(reason === "unverified" ? "unverified" : null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  // Synchronous guard so double clicks / auto-submit can't fire two requests.
  const busy = useRef(false);

  const sync = useCallback((next: VerificationChallenge | null | undefined) => {
    if (!next) return;
    const offset = clockOffsetMs(next.serverNow, Date.now());
    setOffsetMs(offset);
    setNowMs(Date.now() + offset);
    setChallenge(next);
  }, []);

  // Initial state comes from the server, never from "page loaded = new code".
  useEffect(() => {
    if (!email) return;
    let active = true;
    void (async () => {
      const result = await callApi(`${config.statusPath}?email=${encodeURIComponent(email)}`);
      if (!active) return;
      if (result.status === "success") {
        sync(result.challenge);
        setPhase(result.challenge.verified ? "VERIFIED" : "CODE_SENT");
        if (result.challenge.verified) setError("alreadyVerified");
      } else {
        sync(result.challenge);
        setError(result.error);
        setPhase("ERROR");
      }
    })();
    return () => {
      active = false;
    };
  }, [email, sync, config.statusPath]);

  useEffect(() => {
    if (!challenge || challenge.verified) return;
    const id = window.setInterval(() => setNowMs(Date.now() + offsetMs), 1000);
    return () => window.clearInterval(id);
  }, [challenge, offsetMs]);

  const timers = challenge ? deriveTimers(challenge, nowMs) : null;
  // Epoch timestamps = unverified account with no code issued yet.
  const noCode = challenge ? Date.parse(challenge.sentAt) === 0 : false;
  const expired = Boolean(timers?.expired) && !challenge?.verified && !noCode;
  const locked = Boolean(challenge?.locked) && !challenge?.verified;
  const blocked = noCode || expired || locked;
  const verifying = phase === "VERIFYING";
  const sending = phase === "SENDING";
  const done = phase === "VERIFIED";
  const canVerify = Boolean(challenge) && !blocked && !done && !sending && isValidOtp(code);

  const verify = useCallback(
    async (value: string) => {
      if (!email || busy.current || !isValidOtp(value)) return;
      busy.current = true;
      setPhase("VERIFYING");
      setError(null);
      setAttemptsLeft(null);
      setNotice(null);
      try {
        const result = await callApi(config.verifyPath, {
          method: "POST",
          body: JSON.stringify({ email, otp: value }),
        });
        if (result.status === "success") {
          sync(result.challenge);
          setPhase("VERIFIED");
          window.setTimeout(() => {
            router.replace(result.redirectTo ?? config.nextHref);
            router.refresh();
          }, 900);
          return;
        }
        sync(result.challenge);
        setError(result.error);
        setAttemptsLeft(result.error === "invalidCode" ? (result.attemptsRemaining ?? null) : null);
        setCode("");
        setPhase(
          result.error === "expired"
            ? "EXPIRED"
            : result.error === "alreadyVerified"
              ? "VERIFIED"
              : "ERROR",
        );
      } finally {
        busy.current = false;
      }
    },
    [email, router, sync, config.verifyPath, config.nextHref],
  );

  const resend = useCallback(async () => {
    if (!email || busy.current) return;
    busy.current = true;
    setPhase("SENDING");
    setError(null);
    setAttemptsLeft(null);
    setNotice(null);
    try {
      const result = await callApi(config.resendPath, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (result.status === "success") {
        // New code: both countdowns restart from the server's timestamps.
        sync(result.challenge);
        setCode("");
        setNotice("codeSent");
        setPhase("CODE_SENT");
        return;
      }
      sync(result.challenge);
      setError(result.error);
      setPhase(result.error === "alreadyVerified" ? "VERIFIED" : "ERROR");
    } finally {
      busy.current = false;
    }
  }, [email, sync, config.resendPath]);

  if (phase === "IDLE") {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }

  if (!challenge && error) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-12")}>
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid gap-4" aria-live="polite">
        <Alert role="status">
          <CircleCheckIcon className="text-emerald-600 dark:text-emerald-400" />
          <AlertDescription>
            {error === "alreadyVerified" ? t("errors.alreadyVerified") : t("success")}
          </AlertDescription>
        </Alert>
        <Link href={config.nextHref} className={cn(buttonVariants(), "h-12")}>
          {t("continue")}
        </Link>
      </div>
    );
  }

  const resendLabel =
    timers && !timers.canResend
      ? t("resendIn", { time: formatCountdown(timers.resendInSeconds) })
      : t("resend");

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
    >
      {challenge ? (
        <div className="bg-muted/50 flex items-center gap-3 rounded-lg border px-3 py-2.5">
          <MailIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="text-muted-foreground">{t("sentTo")}</p>
            <p className="truncate font-medium" dir="ltr">
              {challenge.email}
            </p>
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="grid gap-3 empty:hidden">
        {notice ? (
          <Alert role="status">
            <AlertDescription>{t(`notices.${notice}`)}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {error === "resendCooldown" && timers && !timers.canResend
                ? t("waitSeconds", { seconds: timers.resendInSeconds })
                : t(`errors.${error}`)}
              {error === "invalidCode" && attemptsLeft !== null && attemptsLeft > 0
                ? ` ${t("attemptsLeft", { count: attemptsLeft })}`
                : null}
            </AlertDescription>
          </Alert>
        ) : locked ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t("errors.tooManyAttempts")}</AlertDescription>
          </Alert>
        ) : expired ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t("expired")}</AlertDescription>
          </Alert>
        ) : noCode ? (
          <Alert role="status">
            <AlertDescription>{t("notices.noCode")}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-3">
        <p id="otp-instruction" className="text-sm">
          {t("instruction")}
        </p>
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error === "invalidCode") setError(null);
          }}
          onComplete={(value) => {
            if (!blocked) void verify(value);
          }}
          length={OTP_LENGTH}
          disabled={verifying || sending || blocked}
          invalid={error === "invalidCode"}
          autoFocus
          label={t("codeLabel")}
          digitLabel={(index) => t("digitLabel", { index, total: OTP_LENGTH })}
          describedBy="otp-instruction otp-countdown"
        />
        {timers && !noCode ? (
          <p
            id="otp-countdown"
            className={
              expired
                ? "text-destructive flex items-center justify-center gap-1.5 text-sm font-medium"
                : "text-muted-foreground flex items-center justify-center gap-1.5 text-sm"
            }
          >
            <TimerIcon className="size-4" aria-hidden />
            <span>{t("expiresIn")}</span>
            <span dir="ltr" className="text-foreground font-semibold tabular-nums">
              {formatCountdown(timers.expiresInSeconds)}
            </span>
          </p>
        ) : null}
      </div>

      <LoadingButton
        type="submit"
        variant="brand"
        className="sheen h-12 text-base font-semibold"
        loading={verifying}
        disabled={!canVerify}
      >
        {verifying ? t("verifying") : t("verify")}
      </LoadingButton>

      <div className="grid gap-2 text-center">
        <p className="text-muted-foreground text-sm">{t("noCode")}</p>
        <LoadingButton
          type="button"
          variant="outline"
          className="h-12 text-base tabular-nums"
          loading={sending}
          disabled={!timers?.canResend || verifying}
          onClick={() => void resend()}
        >
          {resendLabel}
        </LoadingButton>
      </div>

      <Link
        href="/login"
        className="text-muted-foreground justify-self-center text-sm underline-offset-4 hover:underline"
      >
        {t("backToLogin")}
      </Link>
    </form>
  );
}
