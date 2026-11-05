import { jsonAuthResponse, invalidJsonResponse, readJsonBody } from "@/lib/auth/http";
import { bootstrapAdmin } from "@/lib/auth/service";
import type { BootstrapAdminValues } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object") return invalidJsonResponse();

  const result = await bootstrapAdmin(body as BootstrapAdminValues);
  return jsonAuthResponse(result);
}
