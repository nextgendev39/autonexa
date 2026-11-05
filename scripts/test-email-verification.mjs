/**
 * Unit checks for the app-managed email verification OTP (code generation, hashing,
 * timers, input handling, outcome mapping).
 * Imports the real module (Node strips the TypeScript types).
 * Run: node scripts/test-email-verification.mjs
 */

import {
  attemptOutcomeError,
  clockOffsetMs,
  deriveTimers,
  formatCountdown,
  isValidOtp,
  MAX_VERIFY_ATTEMPTS,
  normalizeEmail,
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  sanitizeOtpInput,
} from "../src/lib/auth/email-verification.ts";
import { generateOtp, hashOtp, otpMatches } from "../src/lib/auth/email-otp-crypto.ts";

let failed = 0;
function check(name, condition) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const t0 = Date.parse("2026-10-06T10:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const challenge = { sentAt: iso(t0), expiresAt: iso(t0 + OTP_TTL_SECONDS * 1000) };

// Policy
check("code is 6 digits", OTP_LENGTH === 6);
check("code valid for 5 minutes", OTP_TTL_SECONDS === 300);
check("resend cooldown is 60 seconds", RESEND_COOLDOWN_SECONDS === 60);
check("5 attempts per code", MAX_VERIFY_ATTEMPTS === 5);

// Code format
check("accepts 6 digits", isValidOtp("123456"));
check("rejects 5 digits", !isValidOtp("12345"));
check("rejects 7 digits", !isValidOtp("1234567"));
check("rejects letters", !isValidOtp("12a456"));
check("rejects non-strings", !isValidOtp(123456));
check("sanitize strips non-digits", sanitizeOtpInput("1a2-3 4b5c6") === "123456");
check("sanitize caps pasted length", sanitizeOtpInput("1234567890") === "123456");
check("sanitize folds Arabic-Indic digits", sanitizeOtpInput("١٢٣٤٥٦") === "123456");
check("sanitize folds Persian digits", sanitizeOtpInput("۱۲۳۴۵۶") === "123456");
check("email is normalised", normalizeEmail("  User+Tag@Example.COM ") === "user+tag@example.com");
check("junk email rejected", normalizeEmail("not-an-email") === null && normalizeEmail(null) === null);

// Expiry countdown
let timers = deriveTimers(challenge, t0);
check("fresh code shows 05:00", formatCountdown(timers.expiresInSeconds) === "05:00");
check("fresh code is not expired", !timers.expired);
timers = deriveTimers(challenge, t0 + 28_000);
check("countdown ticks to 04:32", formatCountdown(timers.expiresInSeconds) === "04:32");
timers = deriveTimers(challenge, t0 + 299_500);
check("not expired in the final second", !timers.expired && timers.expiresInSeconds === 1);
timers = deriveTimers(challenge, t0 + 300_000);
check("expired at exactly 5 minutes", timers.expired && formatCountdown(timers.expiresInSeconds) === "00:00");
timers = deriveTimers(challenge, t0 + 3_600_000);
check("countdown never goes negative", timers.expiresInSeconds === 0);

// Resend cooldown
timers = deriveTimers(challenge, t0);
check("resend blocked right after sending", !timers.canResend && timers.resendInSeconds === 60);
timers = deriveTimers(challenge, t0 + 1_000);
check("resend countdown 59s", timers.resendInSeconds === 59);
timers = deriveTimers(challenge, t0 + 28_000);
check("resend countdown 32s", timers.resendInSeconds === 32);
timers = deriveTimers(challenge, t0 + 59_999);
check("resend still blocked at 59.999s", !timers.canResend);
timers = deriveTimers(challenge, t0 + 60_000);
check("resend allowed after 60s", timers.canResend);

// Refresh: state is derived from server timestamps, so a reload changes nothing.
const reloadAt = t0 + 45_000;
const before = deriveTimers(challenge, reloadAt);
const after = deriveTimers({ ...challenge }, reloadAt);
check("refresh keeps resend cooldown", before.resendInSeconds === after.resendInSeconds && !after.canResend);
check("refresh keeps expiry countdown", before.expiresInSeconds === after.expiresInSeconds);

// A browser clock that is 10 minutes fast cannot unlock resend early.
const skewedClient = reloadAt + 600_000;
const offset = clockOffsetMs(iso(reloadAt), skewedClient);
const skewed = deriveTimers(challenge, skewedClient + offset);
check("client clock skew is cancelled", skewed.resendInSeconds === 15 && !skewed.expired);
check("bad server time falls back to no offset", clockOffsetMs("nope", 5) === 0);

// New code resets both windows.
const resentAt = t0 + 400_000;
const resent = { sentAt: iso(resentAt), expiresAt: iso(resentAt + OTP_TTL_SECONDS * 1000) };
timers = deriveTimers(resent, resentAt);
check("new code resets expiry to 05:00", formatCountdown(timers.expiresInSeconds) === "05:00");
check("new code resets resend cooldown", timers.resendInSeconds === 60);

// Database attempt outcomes -> user-facing errors
check("verified -> no error", attemptOutcomeError("verified") === null);
check("wrong code -> invalidCode", attemptOutcomeError("invalid") === "invalidCode");
check("code replaced by a resend -> invalidCode", attemptOutcomeError("stale") === "invalidCode");
check("5th wrong attempt -> tooManyAttempts", attemptOutcomeError("locked") === "tooManyAttempts");
check("expired -> expired", attemptOutcomeError("expired") === "expired");
check("reused code -> alreadyVerified", attemptOutcomeError("already_verified") === "alreadyVerified");
check("unknown -> notFound", attemptOutcomeError("not_found") === "notFound");

// Code generation + hashing (never Math.random, never stored raw)
const codes = Array.from({ length: 5000 }, () => generateOtp(OTP_LENGTH));
check("generated codes are always 6 digits", codes.every((c) => isValidOtp(c)));
check("generated codes vary", new Set(codes).size > 4900);
check("leading zeros allowed", codes.some((c) => c.startsWith("0")));
const userA = "11111111-1111-1111-1111-111111111111";
const userB = "22222222-2222-2222-2222-222222222222";
const stored = hashOtp("042917", userA, "secret-1");
check("stored value is an HMAC-SHA256, not the code", !stored.includes("042917") && /^[0-9a-f]{64}$/.test(stored));
check("correct code matches", otpMatches("042917", userA, stored, "secret-1"));
check("wrong code rejected", !otpMatches("042918", userA, stored, "secret-1"));
check("code bound to its user", !otpMatches("042917", userB, stored, "secret-1"));
check("hash needs the server secret", !otpMatches("042917", userA, stored, "other-secret"));
check("missing hash never matches", !otpMatches("042917", userA, null, "secret-1"));
let threw = false;
try {
  hashOtp("123456", userA, "");
} catch {
  threw = true;
}
check("refuses to hash without EMAIL_VERIFICATION_SECRET", threw);

if (failed > 0) {
  console.error(`\n${failed} email verification check(s) failed`);
  process.exit(1);
}
console.log("\nAll email verification tests passed");
