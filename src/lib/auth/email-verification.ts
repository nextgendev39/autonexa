// Shared (client + server) rules for the app-managed email verification OTP.
// Kept free of path aliases and runtime imports so scripts can import it directly.

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_VERIFY_ATTEMPTS = 5;

export type VerificationErrorKey =
  | "invalidCode"
  | "expired"
  | "tooManyAttempts"
  | "resendCooldown"
  | "emailFailed"
  | "network"
  | "alreadyVerified"
  | "notFound"
  | "generic";

/** Server snapshot of the current code window. Timestamps come from the database. */
export type VerificationChallenge = {
  email: string;
  sentAt: string;
  expiresAt: string;
  verified: boolean;
  /** Code locked after too many incorrect attempts; a new one must be requested. */
  locked: boolean;
  /** Server clock at response time, used to cancel out client clock skew. */
  serverNow: string;
};

export type VerificationApiResponse =
  | { status: "success"; challenge: VerificationChallenge; redirectTo?: string | null }
  | {
      status: "error";
      error: VerificationErrorKey;
      challenge?: VerificationChallenge | null;
      retryAfterSeconds?: number;
      attemptsRemaining?: number;
    };

export type VerificationPhase =
  | "IDLE"
  | "SENDING"
  | "CODE_SENT"
  | "VERIFYING"
  | "VERIFIED"
  | "EXPIRED"
  | "ERROR";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

export function isValidOtp(value: unknown): value is string {
  return typeof value === "string" && value.length === OTP_LENGTH && /^\d+$/.test(value);
}

/** Keeps only ASCII digits (also folds Arabic-Indic digits) and caps the length. */
export function sanitizeOtpInput(value: string, max = OTP_LENGTH): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, max);
}

/** Milliseconds to add to Date.now() to approximate the server clock. */
export function clockOffsetMs(serverNow: string, clientNowMs: number) {
  const server = Date.parse(serverNow);
  return Number.isFinite(server) ? server - clientNowMs : 0;
}

export function secondsUntil(targetIso: string, nowMs: number) {
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - nowMs) / 1000));
}

export function resendAvailableAt(sentAtIso: string) {
  return new Date(Date.parse(sentAtIso) + RESEND_COOLDOWN_SECONDS * 1000).toISOString();
}

/** Countdown derived purely from server timestamps; `nowMs` is server-adjusted. */
export function deriveTimers(challenge: Pick<VerificationChallenge, "sentAt" | "expiresAt">, nowMs: number) {
  const expiresInSeconds = secondsUntil(challenge.expiresAt, nowMs);
  const resendInSeconds = secondsUntil(resendAvailableAt(challenge.sentAt), nowMs);
  return {
    expiresInSeconds,
    resendInSeconds,
    expired: expiresInSeconds === 0,
    canResend: resendInSeconds === 0,
  };
}

/** mm:ss with Latin digits (countdowns are rendered LTR in both locales). */
export function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export type AttemptOutcome =
  | "verified"
  | "invalid"
  | "locked"
  | "expired"
  | "already_verified"
  | "stale"
  | "not_found";

/** Maps the database attempt outcome to a user-facing error (null = verified). */
export function attemptOutcomeError(outcome: AttemptOutcome): VerificationErrorKey | null {
  switch (outcome) {
    case "verified":
      return null;
    case "invalid":
    case "stale":
      return "invalidCode";
    case "locked":
      return "tooManyAttempts";
    case "expired":
      return "expired";
    case "already_verified":
      return "alreadyVerified";
    case "not_found":
      return "notFound";
  }
}
