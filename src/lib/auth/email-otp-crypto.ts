// Server-only helpers for the app-generated email verification code.
// No path aliases so scripts can import it directly.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Uniform 6-digit code (000000–999999) from the OS CSPRNG. Never Math.random. */
export function generateOtp(length = 6): string {
  return String(randomInt(0, 10 ** length)).padStart(length, "0");
}

/**
 * HMAC-SHA256 of the code, keyed with EMAIL_VERIFICATION_SECRET and bound to the
 * user. Only this is stored, so the code can't be recovered (or brute-forced from
 * a database copy) without the server-side secret.
 */
export function hashOtp(code: string, userId: string, secret: string): string {
  if (!secret) throw new Error("EMAIL_VERIFICATION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

/** Constant-time comparison of a submitted code against the stored hash. */
export function otpMatches(
  code: string,
  userId: string,
  storedHash: string | null,
  secret: string,
) {
  if (!storedHash) return false;
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashOtp(code, userId, secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Opaque 256-bit token handed to the browser after a correct password reset code. */
export function generateResetGrant(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this HMAC of the grant is stored, so a database copy can't be replayed. */
export function hashResetGrant(grant: string, secret: string): string {
  if (!secret) throw new Error("EMAIL_VERIFICATION_SECRET is not configured");
  return createHmac("sha256", secret).update(`password-reset:${grant}`).digest("hex");
}
