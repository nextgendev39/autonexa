import { NextResponse } from "next/server";

import { jsonError, requireApiUser } from "@/lib/api/http";
import { staffDocumentUrl } from "@/lib/staff-documents/service";

/** Opens the file (`?download=1` saves it) through a one-minute signed link. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("document.view");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const result = await staffDocumentUrl(id, auth.context, download);
  if (result.error) return jsonError(result.error.code, result.error.message, result.error.code === "not_found" ? 404 : 500);
  return NextResponse.redirect(result.data, { headers: { "Cache-Control": "no-store" } });
}
