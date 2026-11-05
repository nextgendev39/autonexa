import { escapeHtml } from "@/lib/billing/invoice-html";

/** Each email in one place. Pure, so what's sent can be tested. No secrets or card details exist to leak. */
export type OutboxKind =
  | "payment_confirmation"
  | "invoice_issued"
  | "renewal_reminder"
  | "payment_failed"
  | "refund_issued"
  | "subscription_ended";

type Data = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
const day = (value: unknown) => {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export function billingEmail(kind: OutboxKind, data: Data, billingUrl: string) {
  const plan = text(data.plan) || "your plan";
  const invoice = text(data.invoiceNumber);
  const copy: Record<OutboxKind, { subject: string; body: string }> = {
    payment_confirmation: {
      subject: `Payment received${invoice ? `: invoice ${invoice}` : ""}`,
      body: `Thank you. We received your payment for ${plan}${invoice ? `, invoice ${invoice}` : ""}. Your invoice is available in Billing.`,
    },
    invoice_issued: {
      subject: "Your AutoNexa renewal invoice",
      body: `Your renewal invoice is ready${data.due ? `, and due by ${day(data.due)}` : ""}. You can view and pay it in Billing.`,
    },
    renewal_reminder: {
      subject: `Your ${plan} subscription ends soon`,
      body: `Your ${plan} subscription ends on ${day(data.periodEnd)}. Renew in Billing to avoid interruption.`,
    },
    payment_failed: {
      subject: `Payment failed${invoice ? `: invoice ${invoice}` : ""}`,
      body: `Your payment${invoice ? ` for invoice ${invoice}` : ""} didn't go through, and you haven't been charged for it. You can try again in Billing.`,
    },
    refund_issued: {
      subject: `Refund issued${invoice ? `: invoice ${invoice}` : ""}`,
      body: `We've issued a refund${data.amount ? ` of ${text(data.currency)} ${text(data.amount)}` : ""}${invoice ? ` against invoice ${invoice}` : ""}. It can take a few days to reach you.`,
    },
    subscription_ended: {
      subject: `Your ${plan} subscription has ended`,
      body: `Your ${plan} subscription has ended. Your records stay available, and adding new ones is paused until you choose a plan in Billing.`,
    },
  };
  const { subject, body } = copy[kind];
  return {
    subject: `AutoNexa: ${subject}`,
    text: `${body}\n\n${billingUrl}`,
    html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(billingUrl)}">Open Billing</a></p>`,
  };
}
