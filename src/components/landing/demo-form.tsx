"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlertIcon, CircleCheckIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { ease } from "@/components/landing/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Copy = {
  name: string;
  phone: string;
  email: string;
  dealership: string;
  stock: string;
  stockOptions: string[];
  notes: string;
  submit: string;
  sending: string;
  sent: string;
  invalid: string;
  failed: string;
};

type Status = { state: "idle" | "sending" | "sent" | "error"; message: string };

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={cn("grid gap-1.5", wide && "sm:col-span-2")}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function DemoForm({ copy }: { copy: Copy }) {
  const [status, setStatus] = useState<Status>({ state: "idle", message: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const name = String(data.name ?? "").trim();
    const reachable = String(data.phone ?? "").trim() || String(data.email ?? "").trim();
    if (!name || !reachable) {
      setStatus({ state: "error", message: copy.invalid });
      return;
    }

    setStatus({ state: "sending", message: "" });
    try {
      const response = await fetch("/api/landing/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (response.status === 400) {
        setStatus({ state: "error", message: copy.invalid });
      } else if (!response.ok) {
        setStatus({ state: "error", message: copy.failed });
      } else {
        form.reset();
        setStatus({ state: "sent", message: copy.sent });
      }
    } catch {
      setStatus({ state: "error", message: copy.failed });
    }
  }

  const sending = status.state === "sending";
  const fieldClass = "h-11 bg-background";

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
      <Field label={copy.name}>
        <Input
          className={fieldClass}
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
        />
      </Field>
      <Field label={copy.dealership}>
        <Input
          className={fieldClass}
          name="dealership"
          type="text"
          autoComplete="organization"
          maxLength={160}
        />
      </Field>
      <Field label={copy.phone}>
        <Input
          className={fieldClass}
          name="phone"
          type="tel"
          autoComplete="tel"
          dir="ltr"
          maxLength={40}
        />
      </Field>
      <Field label={copy.email}>
        <Input
          className={fieldClass}
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          maxLength={160}
        />
      </Field>
      <Field label={copy.stock} wide>
        <select
          name="stock"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3 md:text-sm"
        >
          {copy.stockOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
      <Field label={copy.notes} wide>
        <Textarea className="bg-background min-h-28" name="notes" rows={4} maxLength={2000} />
      </Field>
      {/* Left empty by people, who never see it. */}
      <label className="absolute -start-[9999px] size-px overflow-hidden" aria-hidden="true">
        Website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>
      <div className="grid gap-3 sm:col-span-2">
        <Button
          type="submit"
          variant="brand"
          size="lg"
          disabled={sending}
          className="sheen h-12 text-base"
        >
          {sending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SendIcon className="rtl:-scale-x-100" />
          )}
          {sending ? copy.sending : copy.submit}
        </Button>
        <div role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            {status.message ? (
              <motion.p
                key={status.message}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease }}
                className={cn(
                  "flex items-start gap-2 rounded-md px-3 py-2.5 text-sm",
                  status.state === "sent"
                    ? "bg-[color-mix(in_oklch,var(--chart-3)_14%,transparent)] text-[var(--chart-3)]"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {status.state === "sent" ? (
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                )}
                {status.message}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </form>
  );
}
