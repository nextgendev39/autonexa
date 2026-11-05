import { getSessionUser } from "@/lib/auth/session";
import { getInvoiceDocument } from "@/lib/billing/data";
import { renderInvoiceHtml } from "@/lib/billing/invoice-html";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * An invoice to view or download (?download=1). Needs a session, and then RLS decides: this dealership's
 * own staff or platform billing staff can read it. Anyone else gets the same 404 as a missing invoice.
 */
export async function GET(request: Request, { params }: RouteContext) {
  if (!(await getSessionUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const document = await getInvoiceDocument(id);
  if (!document) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = document.invoice.invoice_number.replace(/[^A-Za-z0-9-]/g, "");
  return new Response(renderInvoiceHtml(document.invoice, document.transactions), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      ...(download ? { "Content-Disposition": `attachment; filename="${filename}.html"` } : {}),
    },
  });
}
