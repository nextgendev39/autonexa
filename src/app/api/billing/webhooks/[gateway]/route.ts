import { handleWebhook } from "@/lib/billing/service";

type RouteContext = { params: Promise<{ gateway: string }> };

/**
 * Where gateways report what happened. Takes no session: the signature is the proof, and it's checked
 * against the exact bytes received, so the body must be read as text before anything parses it.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { gateway } = await params;
  const rawBody = await request.text();
  const { status, body } = await handleWebhook(gateway, rawBody, request.headers);
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
