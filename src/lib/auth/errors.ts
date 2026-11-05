const authErrorKeys = {
  invalidCredentials: "auth.errors.invalidCredentials",
  emailNotConfirmed: "auth.errors.emailNotConfirmed",
  rateLimit: "auth.errors.rateLimit",
  weakPassword: "auth.errors.weakPassword",
  samePassword: "auth.errors.samePassword",
  notConfigured: "auth.errors.notConfigured",
  generic: "auth.errors.generic",
  session: "auth.errors.session",
  accountSuspended: "auth.errors.accountSuspended",
  accountDisabled: "auth.errors.accountDisabled",
  unauthorized: "auth.errors.unauthorized",
} as const;

export function mapAuthError(error: { message?: string; code?: string | null }) {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login")) {
    return authErrorKeys.invalidCredentials;
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return authErrorKeys.emailNotConfirmed;
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return authErrorKeys.rateLimit;
  }
  if (code === "same_password") {
    return authErrorKeys.samePassword;
  }
  if (code === "weak_password" || message.includes("password should")) {
    return authErrorKeys.weakPassword;
  }
  return authErrorKeys.generic;
}

export { authErrorKeys };
