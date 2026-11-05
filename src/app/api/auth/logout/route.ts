import { jsonAuthResponse } from "@/lib/auth/http";
import { signOutSession } from "@/lib/auth/service";

export async function POST() {
  const result = await signOutSession();
  return jsonAuthResponse(result);
}
