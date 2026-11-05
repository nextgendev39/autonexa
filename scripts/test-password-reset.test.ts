import assert from "node:assert/strict";
import { test } from "node:test";

import { generateResetGrant, hashOtp, hashResetGrant } from "../src/lib/auth/email-otp-crypto";
import { verificationOtpEmail } from "../src/lib/email/verification-otp-email";

const secret = "test-secret";

test("reset grants are long, random and URL-safe", () => {
  const grants = new Set(Array.from({ length: 200 }, generateResetGrant));
  assert.equal(grants.size, 200);
  for (const grant of grants) assert.match(grant, /^[A-Za-z0-9_-]{43}$/);
});

test("grant hash is keyed, deterministic and never the raw grant", () => {
  const grant = generateResetGrant();
  assert.equal(hashResetGrant(grant, secret), hashResetGrant(grant, secret));
  assert.notEqual(hashResetGrant(grant, secret), hashResetGrant(grant, "other-secret"));
  assert.notEqual(hashResetGrant(grant, secret), grant);
  assert.throws(() => hashResetGrant(grant, ""));
});

test("grant hashes can't collide with OTP hashes", () => {
  // Same secret is shared, so the domain prefix keeps the two hash spaces apart.
  assert.notEqual(hashResetGrant("u:123456", secret), hashOtp("123456", "u", secret));
});

test("password reset email uses reset wording and the given link", () => {
  const email = verificationOtpEmail({
    otp: "042317",
    expiresInMinutes: 5,
    verifyUrl: "https://app.test/forgot-password/verify?email=a%40b.co",
    purpose: "passwordReset",
  });
  assert.equal(email.subject, "Reset your AutoNexa password");
  assert.ok(email.text.includes("042317"));
  assert.ok(
    email.text.includes(
      "Enter it on the password reset page: https://app.test/forgot-password/verify",
    ),
  );
  assert.ok(email.html.includes("Reset your password"));
  assert.ok(email.html.includes("did not ask to reset your password"));
  assert.ok(!email.html.includes("Verify your email"));
});

test("invite email is unchanged by default", () => {
  const email = verificationOtpEmail({
    otp: "111111",
    expiresInMinutes: 5,
    verifyUrl: "https://app.test/verify-email",
  });
  assert.equal(email.subject, "Verify your AutoNexa account");
  assert.ok(email.text.includes("Verify your email address"));
  assert.ok(
    email.text.includes("Enter it on the verification page: https://app.test/verify-email"),
  );
  assert.ok(email.text.includes("If you did not create a AutoNexa account"));
  assert.ok(email.html.includes("رمز التحقق الخاص بك أعلاه، وينتهي خلال 5 دقائق"));
});
