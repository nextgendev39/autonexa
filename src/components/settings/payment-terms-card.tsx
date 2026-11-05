"use client";

import { useState } from "react";
import { PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { LoadingButton } from "@/components/shared/loading-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { useFormatDuration } from "@/hooks/use-format-duration";
import { cn } from "@/lib/utils";
import { firstFieldErrors } from "@/lib/validation";
import {
  joinMinutes,
  paymentTermsSchema,
  splitMinutes,
  type DurationParts,
  type PaymentTerms,
} from "@/lib/validation/payment-terms";

type Term = keyof PaymentTerms;
type Unit = keyof DurationParts;
type Draft = Record<Unit, string>;

const UNITS: { unit: Unit; max: number }[] = [
  { unit: "days", max: 365 },
  { unit: "hours", max: 23 },
  { unit: "minutes", max: 59 },
];

const toDraft = (total: number): Draft => {
  const parts = splitMinutes(total);
  return { days: String(parts.days), hours: String(parts.hours), minutes: String(parts.minutes) };
};

/** Whole, in-range parts → total minutes; NaN when a part is invalid. */
const toMinutes = (draft: Draft) => {
  const parts = {} as DurationParts;
  for (const { unit, max } of UNITS) {
    const n = draft[unit].trim() === "" ? 0 : Number(draft[unit]);
    if (!Number.isInteger(n) || n < 0 || n > max) return Number.NaN;
    parts[unit] = n;
  }
  return joinMinutes(parts);
};

/** Booking payment deadlines: deposit (else auto-cancel) and full amount (else alert). */
export function PaymentTermsCard({ initial, canManage }: { initial: PaymentTerms; canManage: boolean }) {
  const t = useTranslations("settings.paymentTerms");
  const tRoot = useTranslations();
  const formatDuration = useFormatDuration();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<Record<Term, Draft>>({
    depositMinutes: toDraft(initial.depositMinutes),
    balanceMinutes: toDraft(initial.balanceMinutes),
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const values = { depositMinutes: toMinutes(form.depositMinutes), balanceMinutes: toMinutes(form.balanceMinutes) };
  const dirty = values.depositMinutes !== saved.depositMinutes || values.balanceMinutes !== saved.balanceMinutes;
  const shown = (term: Term) => (Number.isFinite(values[term]) && values[term] > 0 ? values[term] : saved[term]);

  function setPart(term: Term, unit: Unit, value: string) {
    setForm((prev) => ({ ...prev, [term]: { ...prev[term], [unit]: value } }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const invalid = (Object.keys(values) as Term[]).filter((term) => Number.isNaN(values[term]));
    if (invalid.length > 0) {
      setFieldErrors(Object.fromEntries(invalid.map((term) => [term, "settings.paymentTerms.errors.parts"])));
      return;
    }
    const parsed = paymentTermsSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(firstFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await fetch("/api/settings/payment-terms", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => null);
      if (json?.status !== "success") {
        if (json?.fieldErrors) setFieldErrors(json.fieldErrors);
        toast.error(t("saveFailed"));
        return;
      }
      setSaved(json.data);
      setForm({ depositMinutes: toDraft(json.data.depositMinutes), balanceMinutes: toDraft(json.data.balanceMinutes) });
      toast.success(t("saved"));
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/settings/payment-terms/run", { method: "POST", credentials: "same-origin" });
      const json = await res.json().catch(() => null);
      if (json?.status !== "success") {
        toast.error(t("runFailed"));
        return;
      }
      toast.success(t("ran", { cancelled: json.data.cancelled, overdue: json.data.balanceOverdue }));
    } finally {
      setRunning(false);
    }
  }

  const field = (term: Term) => (
    <fieldset className="grid gap-1.5" aria-describedby={`payment-terms-${term}-hint`}>
      <legend className="mb-1.5 text-sm font-medium">{t(`${term}.label`)}</legend>
      <div className="grid grid-cols-3 gap-2">
        {UNITS.map(({ unit, max }) => (
          <InputGroup key={unit}>
            <InputGroupInput
              aria-label={`${t(`${term}.label`)}: ${t(`units.${unit}`)}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              step={1}
              value={form[term][unit]}
              disabled={!canManage}
              onChange={(e) => setPart(term, unit, e.target.value)}
              aria-invalid={!!fieldErrors[term] || undefined}
              className="tabular-nums"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{t(`units.${unit}`)}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        ))}
      </div>
      {fieldErrors[term] ? (
        <p className="text-destructive text-xs">{tRoot(fieldErrors[term] as Parameters<typeof tRoot>[0])}</p>
      ) : null}
      <p id={`payment-terms-${term}-hint`} className="text-muted-foreground text-xs">
        {t(`${term}.hint`)}
      </p>
    </fieldset>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-6">
          <div className="grid gap-5 md:grid-cols-2">
            {field("depositMinutes")}
            {field("balanceMinutes")}
          </div>

          <ol className="bg-muted/50 grid gap-3 rounded-lg p-4 text-sm sm:grid-cols-3 sm:gap-4">
            <TimelineStep marker={t("timeline.start")} title={t("timeline.booked")} />
            <TimelineStep
              marker={t("timeline.after", { duration: formatDuration(shown("depositMinutes")) })}
              title={t("timeline.deposit")}
              hint={t("timeline.depositMissed")}
              tone="destructive"
            />
            <TimelineStep
              marker={t("timeline.after", { duration: formatDuration(shown("balanceMinutes")) })}
              title={t("timeline.balance")}
              hint={t("timeline.balanceMissed")}
              tone="warning"
            />
          </ol>

          {canManage ? (
            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">{t("appliesTo")}</p>
              <div className="flex flex-wrap gap-2">
                <LoadingButton type="button" variant="outline" loading={running} onClick={runNow}>
                  {running ? null : <PlayIcon />}
                  {t("runNow")}
                </LoadingButton>
                <LoadingButton type="submit" variant="brand" loading={saving} disabled={!dirty}>
                  {t("save")}
                </LoadingButton>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground border-t pt-4 text-xs">{t("readOnly")}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function TimelineStep({
  marker,
  title,
  hint,
  tone,
}: {
  marker: string;
  title: string;
  hint?: string;
  tone?: "destructive" | "warning";
}) {
  return (
    <li className="flex gap-3 sm:flex-col sm:gap-1.5">
      <span
        className={cn(
          "h-fit w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          tone === "destructive" && "bg-destructive/12 text-destructive",
          tone === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          !tone && "bg-background text-foreground border",
        )}
      >
        {marker}
      </span>
      <span className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </span>
    </li>
  );
}
