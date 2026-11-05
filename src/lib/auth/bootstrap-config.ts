import "server-only";

export function getBootstrapSecret() {
  return process.env.BOOTSTRAP_SECRET?.trim() || "";
}

export function isBootstrapEnabled() {
  return getBootstrapSecret().length >= 16;
}

/** A separate secret for the first AutoNexa platform owner. Refused if it's the same as the other. */
export function getPlatformBootstrapSecret() {
  const secret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim() || "";
  return secret.length >= 16 && secret !== getBootstrapSecret() ? secret : "";
}

/** Whether the setup page exists at all. */
export function isAnyBootstrapEnabled() {
  return isBootstrapEnabled() || getPlatformBootstrapSecret().length > 0;
}

export function secretsMatch(provided: string, expected: string) {
  if (!provided || !expected || provided.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
