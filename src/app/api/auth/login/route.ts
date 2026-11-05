import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { signIn } from "@/lib/auth/service";
import type { LoginValues } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const result = await signIn(body as LoginValues);
  return jsonAuthResponse(result);
}
