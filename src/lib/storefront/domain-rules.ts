/** Pure rules for custom domains. */
export const verificationRecordName = (domain: string) => `_autonexa-verify.${domain}`;
export const verificationValue = (token: string) => `autonexa-verify=${token}`;

/** Loopback, private, link-local and similar: nothing a public website lives on. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (ip.includes(":")) {
    if (ip === "::1" || ip === "::") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip)) return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}
