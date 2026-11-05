import { readJsonBody } from "@/lib/auth/http";
import { resendVerificationCode } from "@/lib/auth/email-verification-server";
import { respond } from "@/lib/auth/verification-response";

/** { email } — 60-second cooldown is enforced in the database. */
export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { email?: unknown } | null;
  return respond(await resendVerificationCode(body?.email));
}
