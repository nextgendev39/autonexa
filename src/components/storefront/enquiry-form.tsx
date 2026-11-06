"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";

import { FormField } from "@/components/forms/form-field";
import { PhoneInput } from "@/components/forms/phone-input";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function EnquiryForm({
  stockNumber,
  locale,
  canRequestBooking,
  api = "/api/storefront",
}: {
  stockNumber: string | null;
  locale: string;
  /** Only decides whether to offer it. The server decides whether it's allowed. */
  canRequestBooking: boolean;
  /** The live site's endpoint, or the preview's, which checks the form but sends nothing. */
  api?: string;
}) {
  const t = useTranslations("storefront");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [booking, setBooking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"enquiry" | "booking_request" | "preview" | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const kind = booking ? "booking_request" : "enquiry";
    try {
      const response = await fetch(`${api}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          stockNumber,
          firstName,
          lastName,
          phone,
          email,
          message,
          locale,
          website,
        }),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as {
          data?: { preview?: boolean };
        } | null;
        setSent(body?.data?.preview ? "preview" : kind);
      } else if (response.status === 409) {
        setError(t("enquiry.notAvailable"));
      } else if (response.status === 429) {
        setError(t("enquiry.tooMany"));
      } else if (response.status === 400) {
        setError(t("enquiry.invalid"));
      } else {
        setError(t("enquiry.failed"));
      }
    } catch {
      setError(t("enquiry.failed"));
    }
    setPending(false);
  }

  if (sent) {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertDescription>
          {t(
            sent === "preview"
              ? "enquiry.previewSent"
              : sent === "booking_request"
                ? "enquiry.requestSent"
                : "enquiry.sent",
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("enquiry.firstName")} htmlFor="e-first" required>
          <Input
            id="e-first"
            required
            autoComplete="given-name"
            maxLength={80}
            value={firstName}
            onChange={(e) => setFirst(e.target.value)}
          />
        </FormField>
        <FormField label={t("enquiry.lastName")} htmlFor="e-last" required>
          <Input
            id="e-last"
            required
            autoComplete="family-name"
            maxLength={80}
            value={lastName}
            onChange={(e) => setLast(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label={t("enquiry.phone")} htmlFor="e-phone" required>
        <PhoneInput id="e-phone" value={phone} onChange={setPhone} />
      </FormField>
      <FormField label={t("enquiry.email")} htmlFor="e-email">
        <Input
          id="e-email"
          type="email"
          autoComplete="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label={t("enquiry.message")} htmlFor="e-message">
        <Textarea
          id="e-message"
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </FormField>
      {/* Hidden from people. Bots fill in every field they find. */}
      <div aria-hidden className="absolute -start-[9999px] size-0 overflow-hidden">
        <label htmlFor="e-website">Website</label>
        <input
          id="e-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {canRequestBooking && stockNumber ? (
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={booking} onCheckedChange={setBooking} />
          <span>
            {t("enquiry.requestBooking")}
            <span className="text-muted-foreground block">{t("enquiry.requestBookingHint")}</span>
          </span>
        </label>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <LoadingButton
        type="submit"
        loading={pending}
        className="h-11 ring-1 ring-black/5 ring-inset dark:ring-white/25"
        style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
      >
        {t(booking ? "enquiry.submitRequest" : "enquiry.submit")}
      </LoadingButton>
    </form>
  );
}
