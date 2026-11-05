import "server-only";

import { lookup, Resolver } from "node:dns/promises";
import { connect } from "node:tls";

import { domainsDueForCheck, recordDomainCheck } from "@/lib/server/privileged/storefront";
import { isPrivateAddress, verificationRecordName, verificationValue } from "@/lib/storefront/domain-rules";

const TIMEOUT_MS = 4000;

type TxtOutcome = "found" | "missing" | "unknown";

/** "missing" only when DNS definitely answered. A timeout mustn't take down a working site. */
async function checkTxt(domain: string, token: string): Promise<TxtOutcome> {
  const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 2 });
  try {
    const records = await resolver.resolveTxt(verificationRecordName(domain));
    return records.some((parts) => parts.join("").trim() === verificationValue(token)) ? "found" : "missing";
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? "missing" : "unknown";
  }
}

/**
 * Whether the name serves a certificate browsers trust. Only ever port 443 of a public address, so a
 * domain pointed at an internal address can't turn this into a probe of our own network.
 */
async function checkSsl(domain: string): Promise<"pending" | "active" | "failed"> {
  let address: string;
  try {
    const addresses = await lookup(domain, { all: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) return "failed";
    address = addresses[0].address;
  } catch {
    return "pending";
  }
  return new Promise((resolve) => {
    const socket = connect({ host: address, port: 443, servername: domain, timeout: TIMEOUT_MS, rejectUnauthorized: true });
    const finish = (status: "pending" | "active" | "failed") => {
      socket.destroy();
      resolve(status);
    };
    socket.once("secureConnect", () => finish(socket.authorized ? "active" : "failed"));
    socket.once("timeout", () => finish("pending"));
    socket.once("error", () => finish("pending"));
  });
}

/** Checks DNS and TLS, and records what it found. Returns whether the domain is now verified. */
export async function verifyDomain(row: { id: string; domain: string; verification_token: string }) {
  const txt = await checkTxt(row.domain, row.verification_token);
  if (txt === "unknown") return { verified: false, error: "dns_unavailable" as const };
  if (txt === "missing") {
    await recordDomainCheck(row.id, false, null, "record_missing");
    return { verified: false, error: "record_missing" as const };
  }
  const verified = await recordDomainCheck(row.id, true, await checkSsl(row.domain), null);
  return { verified, error: verified ? null : ("claimed_by_another" as const) };
}

/** Daily re-check. A domain whose owner removed the record stops resolving to the dealership. */
export async function recheckVerifiedDomains() {
  for (const row of await domainsDueForCheck()) {
    try {
      await verifyDomain(row);
    } catch (error) {
      console.error("[storefront] domain re-check failed", row.domain, error);
    }
  }
}
