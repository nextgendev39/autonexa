import "server-only";

export function getBootstrapSecret() {
  return process.env.BOOTSTRAP_SECRET?.trim() || "";
}

export function isBootstrapEnabled() {
  return getBootstrapSecret().length >= 16;
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
