import { headers } from "next/headers";

import { generateOtp, hashOtp, otpMatches } from "@/lib/auth/email-otp-crypto";
import {
  attemptOutcomeError,
  isValidOtp,
  normalizeEmail,
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  resendAvailableAt,
  secondsUntil,
  type AttemptOutcome,
  type VerificationApiResponse,
  type VerificationChallenge,
} from "@/lib/auth/email-verification";
import { isMailerConfigured } from "@/lib/email/send-email";
import { sendVerificationOtpEmail } from "@/lib/email/verification-otp-email";
import { platformClient } from "@/lib/server/privileged";
import { createClient } from "@/lib/supabase/server";

// App-managed email verification. Supabase Auth still owns users, passwords and
// sessions; the app owns the code: it generates it, stores only an HMAC
// (email_verification_otps), emails it over SMTP, checks it, and then marks the
// Supabase user's email as confirmed through the Admin API.

export type AdminClient = ReturnType<typeof platformClient>;

type OtpRow = {
  id: string;
  user_id: string;
  email: string;
  otp_hash: string;
  expires_at: string;
  last_sent_at: string;
  verified_at: string | null;
  attempt_count: number;
  max_attempts: number;
};

type AuditAction =
  | "EMAIL_VERIFICATION_OTP_SENT"
  | "EMAIL_VERIFICATION_OTP_RESENT"
  | "EMAIL_VERIFICATION_SUCCESS"
  | "EMAIL_VERIFICATION_FAILED"
  | "EMAIL_VERIFICATION_EXPIRED"
  | "EMAIL_VERIFICATION_LOCKED"
  | "PASSWORD_RESET_OTP_SENT"
  | "PASSWORD_RESET_OTP_RESENT"
  | "PASSWORD_RESET_VERIFIED"
  | "PASSWORD_RESET_FAILED"
  | "PASSWORD_RESET_EXPIRED"
  | "PASSWORD_RESET_LOCKED"
  | "PASSWORD_RESET_SUCCESS";

/** The OTP table/functions are missing or failing: a setup problem, not SMTP. */
export class VerificationSetupError extends Error {}
/** The email could not be delivered over SMTP. */
export class VerificationEmailError extends Error {}

/** Logs without OTPs, hashes, tokens or raw provider payloads. */
export function logTechnical(event: string, error: unknown) {
  const detail =
    error && typeof error === "object"
      ? {
          code: (error as { code?: unknown }).code ?? null,
          status: (error as { status?: unknown }).status ?? null,
          message: (error as { message?: unknown }).message ?? null,
        }
      : { message: String(error) };
  console.error(`[email-verification] ${event}`, detail);
}

export function verificationSecret() {
  return process.env.EMAIL_VERIFICATION_SECRET?.trim() ?? "";
}

export async function audit(
  admin: AdminClient,
  action: AuditAction,
  userId: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  // Never include codes, hashes, passwords or tokens here.
  // Login events run with no session, so the person's own profile says where they belong.
  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const { error } = await admin.from("audit_logs").insert({
    tenant_id: (profile as unknown as { tenant_id: string | null } | null)?.tenant_id ?? null,
    user_id: userId,
    action,
    entity_type: "auth_user",
    entity_id: userId,
    metadata,
  });
  if (error) logTechnical("audit insert failed", error);
}

export async function verifyPageUrl(email: string, path = "/verify-email") {
  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3003";
  const url = new URL(path, origin);
  url.searchParams.set("email", email);
  return url.toString();
}

async function loadOtp(admin: AdminClient, email: string) {
  const { data, error } = await admin
    .from("email_verification_otps")
    .select(
      "id, user_id, email, otp_hash, expires_at, last_sent_at, verified_at, attempt_count, max_attempts",
    )
    .eq("email", email)
    .maybeSingle();
  if (error) {
    logTechnical("load otp failed", error);
    return { row: null, failed: true } as const;
  }
  return { row: (data as OtpRow | null) ?? null, failed: false } as const;
}

export async function lookupAuthUser(admin: AdminClient, email: string) {
  const { data, error } = await admin.rpc("auth_user_for_email", { p_email: email });
  if (error) {
    logTechnical("auth user lookup failed", error);
    return { user: null, failed: true } as const;
  }
  const user = Array.isArray(data) ? data[0] : null;
  return { user: user ?? null, failed: false } as const;
}

export function toChallenge(row: Pick<OtpRow, "email" | "last_sent_at" | "expires_at" | "verified_at" | "attempt_count" | "max_attempts">): VerificationChallenge {
  return {
    email: row.email,
    sentAt: row.last_sent_at,
    expiresAt: row.expires_at,
    verified: row.verified_at !== null,
    locked: row.attempt_count >= row.max_attempts,
    serverNow: new Date().toISOString(),
  };
}

/** Unverified account with no code yet: nothing to enter, resend available now. */
function emptyChallenge(email: string): VerificationChallenge {
  const epoch = new Date(0).toISOString();
  return { email, sentAt: epoch, expiresAt: epoch, verified: false, locked: false, serverNow: new Date().toISOString() };
}

type IssueResult =
  | { status: "sent"; challenge: VerificationChallenge; sendCount: number }
  | { status: "cooldown"; challenge: VerificationChallenge; retryAfterSeconds: number };

/**
 * Generates a fresh code and atomically replaces the stored hash, unless the
 * previous code is younger than the cooldown. Only a code that was actually stored
 * is emailed, so the database always holds the one valid code.
 */
async function issueAndSend(admin: AdminClient, userId: string, email: string): Promise<IssueResult> {
  const otp = generateOtp(OTP_LENGTH);
  let otpHash: string;
  try {
    otpHash = hashOtp(otp, userId, verificationSecret());
  } catch (error) {
    logTechnical("EMAIL_VERIFICATION_SECRET missing", error);
    throw new VerificationSetupError("EMAIL_VERIFICATION_SECRET is not configured");
  }

  const { data, error } = await admin.rpc("issue_email_verification_otp", {
    p_user_id: userId,
    p_email: email,
    p_otp_hash: otpHash,
    p_cooldown_seconds: RESEND_COOLDOWN_SECONDS,
    p_ttl_seconds: OTP_TTL_SECONDS,
  });
  const slot = Array.isArray(data) ? data[0] : null;
  if (error || !slot) {
    logTechnical("issue otp failed", error ?? "no row");
    throw new VerificationSetupError("Could not store the verification code (is migration 00046 applied?)");
  }

  const challenge: VerificationChallenge = {
    email,
    sentAt: slot.last_sent_at,
    expiresAt: slot.expires_at,
    verified: false,
    locked: false,
    serverNow: new Date().toISOString(),
  };

  if (!slot.issued) {
    const { row } = await loadOtp(admin, email);
    return {
      status: "cooldown",
      challenge: row ? toChallenge(row) : challenge,
      retryAfterSeconds: secondsUntil(resendAvailableAt(slot.last_sent_at), Date.now()),
    };
  }

  try {
    await sendVerificationOtpEmail({
      email,
      otp,
      expiresInMinutes: OTP_TTL_SECONDS / 60,
      verifyUrl: await verifyPageUrl(email),
    });
  } catch (error) {
    logTechnical("smtp send failed", error);
    throw new VerificationEmailError("SMTP delivery failed");
  }

  // Opportunistic retention cleanup (also scheduled via pg_cron when available).
  void admin.rpc("cleanup_email_verification_otps").then(({ error: cleanupError }) => {
    if (cleanupError) logTechnical("cleanup failed", cleanupError);
  });

  return { status: "sent", challenge, sendCount: slot.send_count };
}

/**
 * First code for a freshly invited user. Throws VerificationSetupError /
 * VerificationEmailError so the caller can roll the invite back.
 */
export async function startInviteVerification(input: { userId: string; email: string }) {
  const email = normalizeEmail(input.email);
  if (!email) throw new VerificationSetupError("Invalid email");
  if (!isMailerConfigured()) throw new VerificationEmailError("SMTP is not configured");

  const admin = platformClient();
  const result = await issueAndSend(admin, input.userId, email);
  if (result.status !== "sent") throw new VerificationSetupError("Unexpected resend cooldown on a new invite");
  await audit(admin, "EMAIL_VERIFICATION_OTP_SENT", input.userId, { send_count: result.sendCount });
}

export async function getVerificationStatus(rawEmail: unknown): Promise<VerificationApiResponse> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: "error", error: "notFound" };
  const admin = platformClient();

  const { row, failed } = await loadOtp(admin, email);
  if (failed) return { status: "error", error: "generic" };
  if (row) return { status: "success", challenge: toChallenge(row) };

  const { user, failed: lookupFailed } = await lookupAuthUser(admin, email);
  if (lookupFailed) return { status: "error", error: "generic" };
  if (!user) return { status: "error", error: "notFound" };
  if (user.email_confirmed_at) return { status: "error", error: "alreadyVerified" };
  return { status: "success", challenge: emptyChallenge(email) };
}

export async function resendVerificationCode(rawEmail: unknown): Promise<VerificationApiResponse> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: "error", error: "notFound" };
  if (!isMailerConfigured()) {
    logTechnical("resend blocked", "SMTP is not configured");
    return { status: "error", error: "emailFailed" };
  }

  const admin = platformClient();
  const { user, failed } = await lookupAuthUser(admin, email);
  if (failed) return { status: "error", error: "generic" };
  if (!user) return { status: "error", error: "notFound" };
  if (user.email_confirmed_at) return { status: "error", error: "alreadyVerified" };

  try {
    const result = await issueAndSend(admin, user.user_id, email);
    if (result.status === "cooldown") {
      return {
        status: "error",
        error: "resendCooldown",
        challenge: result.challenge,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    await audit(admin, "EMAIL_VERIFICATION_OTP_RESENT", user.user_id, { send_count: result.sendCount });
    return { status: "success", challenge: result.challenge };
  } catch (error) {
    const { row } = await loadOtp(admin, email);
    return {
      status: "error",
      error: error instanceof VerificationEmailError ? "emailFailed" : "generic",
      challenge: row ? toChallenge(row) : null,
    };
  }
}

/**
 * After a correct code: confirm the email in Supabase Auth, then mint a one-time
 * Supabase token server-side and redeem it with the cookie-bound client so the
 * person is signed in. The token never leaves the server.
 */
async function confirmAndOpenSession(admin: AdminClient, userId: string, email: string) {
  const { error: confirmError } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (confirmError) {
    logTechnical("email_confirm update failed", confirmError);
    return false;
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    logTechnical("session link failed", linkError ?? "missing token");
    return false;
  }

  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (sessionError) {
    logTechnical("session exchange failed", sessionError);
    return false;
  }
  return true;
}

export async function verifyEmailCode(rawEmail: unknown, code: unknown): Promise<VerificationApiResponse> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: "error", error: "notFound" };
  if (!isValidOtp(code)) return { status: "error", error: "invalidCode" };

  const admin = platformClient();
  const { row, failed } = await loadOtp(admin, email);
  if (failed) return { status: "error", error: "generic" };
  if (!row) return { status: "error", error: "invalidCode" };

  let matches = false;
  try {
    matches = otpMatches(code, row.user_id, row.otp_hash, verificationSecret());
  } catch (error) {
    logTechnical("EMAIL_VERIFICATION_SECRET missing", error);
    return { status: "error", error: "generic" };
  }

  // Expiry, attempt limit and single use are decided in the database under a row lock.
  const { data, error } = await admin.rpc("record_email_verification_attempt", {
    p_otp_id: row.id,
    p_compared_hash: row.otp_hash,
    p_matches: matches,
  });
  const attempt = Array.isArray(data) ? data[0] : null;
  if (error || !attempt) {
    logTechnical("record attempt failed", error ?? "no row");
    return { status: "error", error: "generic" };
  }

  const outcome = attempt.outcome as AttemptOutcome;
  const failure = attemptOutcomeError(outcome);
  if (failure) {
    if (outcome === "invalid") {
      await audit(admin, "EMAIL_VERIFICATION_FAILED", row.user_id, {
        attempts_remaining: attempt.attempts_remaining,
      });
    } else if (outcome === "locked") {
      await audit(admin, "EMAIL_VERIFICATION_LOCKED", row.user_id);
    } else if (outcome === "expired") {
      await audit(admin, "EMAIL_VERIFICATION_EXPIRED", row.user_id);
    }
    const { row: latest } = await loadOtp(admin, email);
    return {
      status: "error",
      error: failure,
      challenge: latest ? toChallenge(latest) : null,
      attemptsRemaining: attempt.attempts_remaining,
    };
  }

  if (!(await confirmAndOpenSession(admin, row.user_id, email))) {
    // Let them retry with the same code rather than stranding a half-verified account.
    await admin.rpc("reopen_email_verification_otp", { p_otp_id: row.id });
    return { status: "error", error: "generic", challenge: toChallenge(row) };
  }

  await audit(admin, "EMAIL_VERIFICATION_SUCCESS", row.user_id);
  const challenge = toChallenge({ ...row, verified_at: new Date().toISOString() });

  // Invited accounts still need a password; that page activates the profile.
  return { status: "success", challenge, redirectTo: "/accept-invitation" };
}

/** The account behind an email that still has to verify, if there is one. */
export async function pendingVerificationUserId(rawEmail: unknown): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  try {
    const { user } = await lookupAuthUser(platformClient(), email);
    return user && !user.email_confirmed_at ? user.user_id : null;
  } catch (error) {
    logTechnical("pending lookup failed", error);
    return null;
  }
}
