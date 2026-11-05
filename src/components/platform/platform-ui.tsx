"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/shared/loading-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "@/lib/i18n/navigation";

type Method = "POST" | "PATCH" | "DELETE";
type Outcome = { ok: true; data: unknown } | { ok: false; message: string };

/** Calls a console API route. Authorization happens there and in the database, never here. */
export async function platformRequest(path: string, method: Method, body?: unknown): Promise<Outcome> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: json?.data ?? null };
    return { ok: false, message: json?.message ?? "" };
  } catch {
    return { ok: false, message: "" };
  }
}

/** Runs an action, then shows the result and reloads the page's server-rendered data. */
export function usePlatformAction() {
  const router = useRouter();
  const t = useTranslations("platform");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (path: string, method: Method, body?: unknown) => {
    setPending(true);
    setError(null);
    const outcome = await platformRequest(path, method, body);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.message || t("common.failed"));
      return false;
    }
    toast.success(t("common.saved"));
    router.refresh();
    return true;
  };

  return { run, pending, error, setError };
}

/** A button that opens a form. `onSubmit` returns whether it worked, which closes the dialog. */
export function ActionDialog({
  trigger,
  title,
  description,
  submitLabel,
  destructive,
  error,
  pending,
  onSubmit,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  submitLabel: string;
  destructive?: boolean;
  error: string | null;
  pending: boolean;
  onSubmit: () => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const t = useTranslations("platform");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onSubmit()) setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <LoadingButton
              type="submit"
              loading={pending}
              variant={destructive ? "destructive" : "default"}
            >
              {submitLabel}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SimpleSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(current: string | null) => options.find((o) => o.value === current)?.label ?? ""}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PlatformStatus({ status }: { status: string }) {
  const t = useTranslations("platform");
  return <StatusBadge status={status} label={t(`status.${status}` as never)} />;
}

/** A date input's value as the end of that day in UTC, or null when left empty. */
export function endOfDayIso(value: string) {
  return value ? new Date(`${value}T23:59:59.000Z`).toISOString() : null;
}
