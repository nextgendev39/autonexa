import { readJsonBody } from "@/lib/auth/http";
import { sendPasswordResetCode } from "@/lib/auth/password-reset-server";
import { respond } from "@/lib/auth/verification-response";

/** { email } — 60-second cooldown is enforced in the database. */
export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { email?: unknown } | null;
  return respond(await sendPasswordResetCode(body?.email));
}
