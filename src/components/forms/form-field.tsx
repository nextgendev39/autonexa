"use client";

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
    <div className="grid content-start gap-2">
      <Label htmlFor={htmlFor} className="gap-0.5">
        {label}
        {required ? (
          <>
            <span className="text-destructive" aria-hidden>
              *
            </span>
            <span className="sr-only"> ({t("validation.required")})</span>
          </>
        ) : null}
      </Label>
      {children}
      {hint && !message ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {message ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-destructive text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}
