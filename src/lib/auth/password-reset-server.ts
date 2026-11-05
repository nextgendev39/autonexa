import {
  generateOtp,
  generateResetGrant,
  hashOtp,
  hashResetGrant,
  otpMatches,
} from "@/lib/auth/email-otp-crypto";
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
import {
  audit,
  logTechnical,
  lookupAuthUser,
  toChallenge,
  verificationSecret,
  verifyPageUrl,
  VerificationEmailError,
  VerificationSetupError,
  type AdminClient,
} from "@/lib/auth/email-verification-server";
import { isMailerConfigured } from "@/lib/email/send-email";
import { sendVerificationOtpEmail } from "@/lib/email/verification-otp-email";
import { platformClient } from "@/lib/server/privileged";

// Password reset by emailed code, mirroring the invite verification flow.
// Supabase Auth still owns the password; the app owns the code and the grant:
//   1. request  -> 6-digit code emailed (HMAC stored, 5 min, 60s resend cooldown)
//   2. verify   -> correct code returns a single-use grant (HMAC stored, 10 min)
//   3. reset    -> the grant is consumed atomically, then the password is set
//                  through the Admin API. No session is opened at any step.
//
// Responses never reveal whether an email has an account: unknown or ineligible
// emails get the same "code sent" answer, and their codes simply never match.

export const RESET_GRANT_COOKIE = "zm_password_reset";
export const RESET_GRANT_TTL_SECONDS = 10 * 60;
export const VERIFY_PATH = "/forgot-password/verify";

type ResetRow = {
  id: string;
  user_id: string;
  email: string;
  otp_hash: string;
  expires_at: string;
  last_sent_at: string;
  verified_at: string | null;
  attempt_count: number;
  max_attempts: number;
  grant_expires_at: string | null;
  grant_used_at: string | null;
};

async function loadRow(admin: AdminClient, email: string) {
  const { data, error } = await admin
    .from("password_reset_otps")
    .select(
      "id, user_id, email, otp_hash, expires_at, last_sent_at, verified_at, attempt_count, max_attempts, grant_expires_at, grant_used_at",
    )
    .eq("email", email)
    .maybeSingle();
  if (error) {
    logTechnical("load reset otp failed", error);
    return { row: null, failed: true } as const;
  }
  return { row: (data as ResetRow | null) ?? null, failed: false } as const;
}

/** A grant that can still be redeemed means the code step is done. */
function grantOpen(row: ResetRow) {
  return (
    row.verified_at !== null &&
    row.grant_used_at === null &&
    row.grant_expires_at !== null &&
    Date.parse(row.grant_expires_at) > Date.now()
  );
}

function rowChallenge(row: ResetRow): VerificationChallenge {
  // A verified code whose grant was used or lapsed can't be reused; show it as
  // expired so the page offers a new code.
  if (row.verified_at !== null && !grantOpen(row)) {
    return { ...toChallenge({ ...row, verified_at: null }), expiresAt: row.verified_at };
  }
  return toChallenge({ ...row, verified_at: grantOpen(row) ? row.verified_at : null });
}

/** What an unknown email sees: indistinguishable from a code just sent. */
function decoyChallenge(email: string): VerificationChallenge {
  const now = Date.now();
  return {
    email,
    sentAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OTP_TTL_SECONDS * 1000).toISOString(),
    verified: false,
    locked: false,
    serverNow: new Date(now).toISOString(),
  };
}

/** Only active staff with a confirmed email can reset; invites finish via their own flow. */
async function eligibleUser(admin: AdminClient, email: string) {
  const { user, failed } = await lookupAuthUser(admin, email);
  if (failed) return { user: null, failed: true } as const;
  if (!user || !user.email_confirmed_at) return { user: null, failed: false } as const;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("status, deleted_at")
    .eq("id", user.user_id)
    .maybeSingle();
  if (error) {
    logTechnical("reset profile lookup failed", error);
    return { user: null, failed: true } as const;
  }
  if (!profile || profile.deleted_at || profile.status !== "active") {
    return { user: null, failed: false } as const;
  }
  return { user, failed: false } as const;
}

type IssueResult =
  | { status: "sent"; challenge: VerificationChallenge; sendCount: number }
  | { status: "cooldown"; challenge: VerificationChallenge; retryAfterSeconds: number };

async function issueAndSend(
  admin: AdminClient,
  userId: string,
  email: string,
): Promise<IssueResult> {
  const otp = generateOtp(OTP_LENGTH);
  let otpHash: string;
  try {
    otpHash = hashOtp(otp, userId, verificationSecret());
  } catch (error) {
    logTechnical("EMAIL_VERIFICATION_SECRET missing", error);
    throw new VerificationSetupError("EMAIL_VERIFICATION_SECRET is not configured");
  }

  const { data, error } = await admin.rpc("issue_password_reset_otp", {
    p_user_id: userId,
    p_email: email,
    p_otp_hash: otpHash,
    p_cooldown_seconds: RESEND_COOLDOWN_SECONDS,
    p_ttl_seconds: OTP_TTL_SECONDS,
  });
  const slot = Array.isArray(data) ? data[0] : null;
  if (error || !slot) {
    logTechnical("issue reset otp failed", error ?? "no row");
    throw new VerificationSetupError(
      "Could not store the reset code (is migration 00068 applied?)",
    );
  }

  if (!slot.issued) {
    const { row } = await loadRow(admin, email);
    return {
      status: "cooldown",
      challenge: row ? rowChallenge(row) : decoyChallenge(email),
      retryAfterSeconds: secondsUntil(resendAvailableAt(slot.last_sent_at), Date.now()),
    };
  }

  try {
    await sendVerificationOtpEmail({
      email,
      otp,
      expiresInMinutes: OTP_TTL_SECONDS / 60,
      verifyUrl: await verifyPageUrl(email, VERIFY_PATH),
      purpose: "passwordReset",
    });
  } catch (error) {
    logTechnical("reset smtp send failed", error);
    throw new VerificationEmailError("SMTP delivery failed");
  }

  void admin.rpc("cleanup_password_reset_otps").then(({ error: cleanupError }) => {
    if (cleanupError) logTechnical("reset cleanup failed", cleanupError);
  });

  return {
    status: "sent",
    challenge: {
      email,
      sentAt: slot.last_sent_at,
      expiresAt: slot.expires_at,
      verified: false,
      locked: false,
      serverNow: new Date().toISOString(),
    },
    sendCount: slot.send_count,
  };
}

/**
 * Sends (or, inside the cooldown, keeps) the reset code. Used by both the first
 * request and the Resend button; `initial` only changes the audit label and how a
 * cooldown is reported (a repeated first request just reopens the code page).
 */
export async function sendPasswordResetCode(
  rawEmail: unknown,
  { initial = false }: { initial?: boolean } = {},
): Promise<VerificationApiResponse> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: "error", error: "notFound" };
  if (!isMailerConfigured()) {
    logTechnical("reset blocked", "SMTP is not configured");
    return { status: "error", error: "emailFailed" };
  }

  const admin = platformClient();
  const { user, failed } = await eligibleUser(admin, email);
  if (failed) return { status: "error", error: "generic" };
  if (!user) return { status: "success", challenge: decoyChallenge(email) };

  try {
    const result = await issueAndSend(admin, user.user_id, email);
    if (result.status === "cooldown") {
      if (initial) return { status: "success", challenge: result.challenge };
      return {
        status: "error",
        error: "resendCooldown",
        challenge: result.challenge,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    await audit(
      admin,
      initial ? "PASSWORD_RESET_OTP_SENT" : "PASSWORD_RESET_OTP_RESENT",
      user.user_id,
      {
        send_count: result.sendCount,
      },
    );
    return { status: "success", challenge: result.challenge };
  } catch (error) {
    const { row } = await loadRow(admin, email);
    return {
      status: "error",
      error: error instanceof VerificationEmailError ? "emailFailed" : "generic",
      challenge: row ? rowChallenge(row) : null,
    };
  }
}

/** Current code window, so a refresh restores the countdowns. */
export async function getPasswordResetStatus(rawEmail: unknown): Promise<VerificationApiResponse> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: "error", error: "notFound" };

  const { row, failed } = await loadRow(platformClient(), email);
  if (failed) return { status: "error", error: "generic" };
  return { status: "success", challenge: row ? rowChallenge(row) : decoyChallenge(email) };
}

/**
 * Checks the code. On success returns a fresh grant for the caller to set as an
 * httpOnly cookie; the database keeps only its HMAC.
 */
export async function verifyPasswordResetCode(
  rawEmail: unknown,
  code: unknown,
): Promise<{ result: VerificationApiResponse; grant?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { result: { status: "error", error: "notFound" } };
  if (!isValidOtp(code)) return { result: { status: "error", error: "invalidCode" } };

  const admin = platformClient();
  const { row, failed } = await loadRow(admin, email);
  if (failed) return { result: { status: "error", error: "generic" } };
  if (!row)
    return { result: { status: "error", error: "invalidCode", challenge: decoyChallenge(email) } };

  let matches = false;
  let grant = "";
  let grantHash = "";
  try {
    const secret = verificationSecret();
    matches = otpMatches(code, row.user_id, row.otp_hash, secret);
    grant = generateResetGrant();
    grantHash = hashResetGrant(grant, secret);
  } catch (error) {
    logTechnical("EMAIL_VERIFICATION_SECRET missing", error);
    return { result: { status: "error", error: "generic" } };
  }

  // Expiry, attempt limit and single use are decided in the database under a row lock.
  const { data, error } = await admin.rpc("record_password_reset_attempt", {
    p_otp_id: row.id,
    p_compared_hash: row.otp_hash,
    p_matches: matches,
    p_grant_hash: grantHash,
    p_grant_ttl_seconds: RESET_GRANT_TTL_SECONDS,
  });
  const attempt = Array.isArray(data) ? data[0] : null;
  if (error || !attempt) {
    logTechnical("record reset attempt failed", error ?? "no row");
    return { result: { status: "error", error: "generic" } };
  }

  const outcome = attempt.outcome as AttemptOutcome;
  const failure = attemptOutcomeError(outcome);
  if (failure) {
    if (outcome === "invalid") {
      await audit(admin, "PASSWORD_RESET_FAILED", row.user_id, {
        attempts_remaining: attempt.attempts_remaining,
      });
    } else if (outcome === "locked") {
      await audit(admin, "PASSWORD_RESET_LOCKED", row.user_id);
    } else if (outcome === "expired") {
      await audit(admin, "PASSWORD_RESET_EXPIRED", row.user_id);
    }
    const { row: latest } = await loadRow(admin, email);
    // A code that was already used must be requested again, not reported as success.
    const error = failure === "alreadyVerified" ? "expired" : failure;
    return {
      result: {
        status: "error",
        error,
        challenge: latest ? rowChallenge(latest) : null,
        attemptsRemaining: attempt.attempts_remaining,
      },
    };
  }

  await audit(admin, "PASSWORD_RESET_VERIFIED", row.user_id);
  return {
    result: {
      status: "success",
      challenge: { ...toChallenge(row), verified: true },
      redirectTo: "/reset-password",
    },
    grant,
  };
}

function grantHashOf(grant: string | undefined) {
  if (!grant || grant.length > 128) return null;
  try {
    return hashResetGrant(grant, verificationSecret());
  } catch (error) {
    logTechnical("EMAIL_VERIFICATION_SECRET missing", error);
    return null;
  }
}

/** Read-only check used by the reset page to decide between the form and "start over". */
export async function hasValidResetGrant(grant: string | undefined) {
  const hash = grantHashOf(grant);
  if (!hash) return false;
  const { data, error } = await platformClient()
    .from("password_reset_otps")
    .select("id")
    .eq("grant_hash", hash)
    .is("grant_used_at", null)
    .gt("grant_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) logTechnical("reset grant lookup failed", error);
  return Boolean(data);
}

export type ResetOutcome =
  | { status: "success" }
  | { status: "error"; error: "session" | "accountSuspended" | "accountDisabled" | "generic" }
  | { status: "error"; error: "auth"; authError: { message?: string; code?: string | null } };

/** Redeems the grant once and sets the new password through the Admin API. */
export async function resetPasswordWithGrant(
  grant: string | undefined,
  password: string,
): Promise<ResetOutcome> {
  const hash = grantHashOf(grant);
  if (!hash) return { status: "error", error: "session" };

  const admin = platformClient();
  const { data, error } = await admin.rpc("consume_password_reset_grant", { p_grant_hash: hash });
  const redeemed = Array.isArray(data) ? data[0] : null;
  if (error) {
    logTechnical("consume reset grant failed", error);
    return { status: "error", error: "generic" };
  }
  if (!redeemed) return { status: "error", error: "session" };

  const release = () => admin.rpc("release_password_reset_grant", { p_otp_id: redeemed.otp_id });

  // The account may have been deactivated since the code was sent.
  const { data: profile } = await admin
    .from("profiles")
    .select("status, deleted_at")
    .eq("id", redeemed.user_id)
    .maybeSingle();
  if (!profile || profile.deleted_at) return { status: "error", error: "session" };
  if (profile.status === "suspended") return { status: "error", error: "accountSuspended" };
  if (profile.status === "disabled") return { status: "error", error: "accountDisabled" };
  if (profile.status !== "active") return { status: "error", error: "session" };

  const { error: updateError } = await admin.auth.admin.updateUserById(redeemed.user_id, {
    password,
  });
  if (updateError) {
    logTechnical("reset password update failed", updateError);
    await release();
    return { status: "error", error: "auth", authError: updateError };
  }

  await audit(admin, "PASSWORD_RESET_SUCCESS", redeemed.user_id);
  return { status: "success" };
}
