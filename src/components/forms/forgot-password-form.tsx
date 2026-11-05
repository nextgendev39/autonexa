"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { FormField, useTranslatedMessage } from "@/components/forms/form-field";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { Link } from "@/lib/i18n/navigation";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validation";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const translate = useTranslatedMessage();
  const { state, pending, submit } = useAuthSubmit("/api/auth/forgot-password");
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    for (const [key, message] of Object.entries(state.fieldErrors)) {
      form.setError(key as keyof ForgotPasswordValues, { message });
    }
  }, [state, form]);

  // Success navigates to the code page; keep the button busy until it does.
  const busy = pending || state.status === "success";

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit((values) => {
        void submit(values);
      })}
      noValidate
    >
      {state.formError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{translate(state.formError)}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        label={t("auth.login.email")}
        htmlFor="email"
        error={form.formState.errors.email?.message}
        required
      >
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          dir="ltr"
          className="h-11 md:h-10"
          aria-invalid={Boolean(form.formState.errors.email) || undefined}
          aria-describedby={form.formState.errors.email ? "email-error" : undefined}
          readOnly={busy}
          {...form.register("email")}
        />
      </FormField>
      <LoadingButton
        type="submit"
        variant="brand"
        className="sheen h-11 font-semibold"
        loading={busy}
      >
        {t("auth.forgot.submit")}
      </LoadingButton>
      <Link
        href="/login"
        className="text-muted-foreground justify-self-center text-sm underline-offset-4 hover:underline"
      >
        {t("auth.forgot.back")}
      </Link>
    </form>
  );
}
