"use client";

import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";

const translatedPrefixes = ["validation.", "auth.", "errors."];

export function useTranslatedMessage() {
  const t = useTranslations();
  return (key?: string) => {
    if (!key) return undefined;
    if (translatedPrefixes.some((prefix) => key.startsWith(prefix))) {
      return t(key as Parameters<typeof t>[0]);
    }
    return key;
  };
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  /** Shows a required asterisk next to the label. */
  required?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const message = useTranslatedMessage()(error);

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor} className="text-foreground/90 gap-1 text-[0.8125rem] font-medium">
        {label}
        {required ? (
          <>
            <span className="text-brand text-sm leading-none" aria-hidden>
              *
            </span>
            <span className="sr-only"> ({t("validation.required")})</span>
          </>
        ) : null}
      </Label>
      {children}
      {hint && !message ? <p className="text-subtle-foreground text-xs">{hint}</p> : null}
      {message ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-xs"
        >
          <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
