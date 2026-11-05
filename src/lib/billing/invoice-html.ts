/**
 * A downloadable invoice, as a self-contained page that also prints cleanly to PDF. HTML rather than
 * a generated PDF, so Arabic names render properly and no PDF library is needed. Every value is escaped,
 * since names and addresses come from what people typed.
 */
export type InvoiceDocument = {
  invoice_number: string;
  status: string;
  kind: string;
  description: string | null;
  currency: string;
  amount: number | string;
  subtotal: number | string | null;
  credit_amount: number | string | null;
  tax_rate: number | string | null;
  tax_label: string | null;
  tax_amount: number | string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  is_test: boolean;
  billing_snapshot: {
    seller?: { name?: string | null; taxId?: string | null; address?: string | null; email?: string | null };
    buyer?: { name?: string | null; taxId?: string | null; address?: string | null; city?: string | null; country?: string | null; email?: string | null };
  } | null;
};

export type InvoiceTransaction = {
  kind: string;
  status: string;
  amount: number | string;
  currency: string;
  method: string;
  reference: string | null;
  occurred_at: string;
};

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const money = (value: number | string | null | undefined, currency: string) =>
  `${escapeHtml(currency)} ${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value: string | null) => (value ? escapeHtml(new Date(value).toISOString().slice(0, 10)) : "");
const lines = (...values: (string | null | undefined)[]) => values.filter(Boolean).map((value) => escapeHtml(value)).join("<br>");

export function renderInvoiceHtml(invoice: InvoiceDocument, transactions: InvoiceTransaction[]) {
  const seller = invoice.billing_snapshot?.seller ?? {};
  const buyer = invoice.billing_snapshot?.buyer ?? {};
  const hasTax = invoice.tax_amount !== null;
  const received = transactions
    .filter((t) => t.status === "succeeded")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const heading = hasTax ? "Tax Invoice" : "Invoice";

  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="total"' : ""}><td>${escapeHtml(label)}</td><td class="n">${value}</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)} ${escapeHtml(invoice.invoice_number)}</title>
<style>
  body { font: 14px/1.5 system-ui, "Segoe UI", "Noto Sans Arabic", Arial, sans-serif; color: #111; margin: 0; padding: 32px; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #555; margin: 0 0 6px; }
  .meta { color: #555; margin: 0 0 24px; }
  .test { background: #fff3cd; border: 1px solid #e0c36a; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-weight: 600; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: start; vertical-align: top; }
  .n { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total td { font-weight: 700; border-top: 2px solid #111; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<main>
${invoice.is_test ? '<p class="test">TEST MODE. No real money. This is not a valid tax document.</p>' : ""}
<h1>${escapeHtml(heading)}</h1>
<p class="meta">${escapeHtml(invoice.invoice_number)} · Status: ${escapeHtml(invoice.status)}<br>
Issued ${day(invoice.issued_at)}${invoice.due_at ? ` · Due ${day(invoice.due_at)}` : ""}${invoice.paid_at ? ` · Paid ${day(invoice.paid_at)}` : ""}</p>
<section class="parties">
  <div><h2>From</h2><div dir="auto">${lines(seller.name, seller.address, seller.email)}${seller.taxId ? `<br>Tax ID: ${escapeHtml(seller.taxId)}` : ""}</div></div>
  <div><h2>Bill to</h2><div dir="auto">${lines(buyer.name, buyer.address, buyer.city, buyer.country, buyer.email)}${buyer.taxId ? `<br>Tax ID: ${escapeHtml(buyer.taxId)}` : ""}</div></div>
</section>
<table>
  <thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
  <tbody>
    ${row(invoice.description ?? "Subscription", money(invoice.subtotal ?? invoice.amount, invoice.currency))}
    ${Number(invoice.credit_amount ?? 0) > 0 ? row("Credit for unused time", `-${money(invoice.credit_amount, invoice.currency)}`) : ""}
    ${hasTax ? row(`${invoice.tax_label ?? "Tax"} (${Number(invoice.tax_rate ?? 0)}%)`, money(invoice.tax_amount, invoice.currency)) : ""}
    ${row("Total", money(invoice.amount, invoice.currency), true)}
    ${row("Received", money(received, invoice.currency))}
  </tbody>
</table>
${
  transactions.length > 0
    ? `<h2>Transactions</h2>
<table>
  <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Reference</th><th class="n">Amount</th></tr></thead>
  <tbody>
    ${transactions
      .map(
        (t) =>
          `<tr><td>${day(t.occurred_at)}</td><td>${escapeHtml(t.kind)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.reference ?? "")}</td><td class="n">${money(t.amount, t.currency)}</td></tr>`,
      )
      .join("\n    ")}
  </tbody>
</table>`
    : ""
}
</main>
</body>
</html>`;
}
