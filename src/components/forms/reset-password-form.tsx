"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { FormField, useTranslatedMessage } from "@/components/forms/form-field";
import { LoadingButton } from "@/components/shared/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { Link } from "@/lib/i18n/navigation";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validation";

export function ResetPasswordForm() {
  const t = useTranslations();
  const translate = useTranslatedMessage();
  const [showPassword, setShowPassword] = useState(false);
  const { state, pending, submit } = useAuthSubmit("/api/auth/reset-password");
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    for (const [key, message] of Object.entries(state.fieldErrors)) {
      form.setError(key as keyof ResetPasswordValues, { message });
    }
  }, [state, form]);

  // Success navigates to the login page; keep the button busy until it does.
  const done = state.status === "success";
  // The grant is gone after these; only a new code can help.
  const restart = state.formError === "auth.errors.session";

  const errors = form.formState.errors;
  const inputType = showPassword ? "text" : "password";

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
      {restart ? (
        <Link href="/forgot-password" className="text-sm underline-offset-4 hover:underline">
          {t("auth.reset.startOver")}
        </Link>
      ) : null}
      <fieldset disabled={pending || done} className="grid gap-4">
        <FormField
          label={t("auth.reset.password")}
          htmlFor="password"
          error={errors.password?.message}
          hint={t("auth.reset.rules")}
          required
        >
          <div className="relative">
            <Input
              id="password"
              type={inputType}
              autoComplete="new-password"
              autoFocus
              className="h-11 pe-11 md:h-10"
              aria-invalid={Boolean(errors.password) || undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...form.register("password")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute end-1 top-1/2 -translate-y-1/2"
              aria-label={
                showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")
              }
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
          </div>
        </FormField>
        <FormField
          label={t("auth.reset.confirm")}
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
          required
        >
          <Input
            id="confirmPassword"
            type={inputType}
            autoComplete="new-password"
            className="h-11 md:h-10"
            aria-invalid={Boolean(errors.confirmPassword) || undefined}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            {...form.register("confirmPassword")}
          />
        </FormField>
      </fieldset>
      <LoadingButton
        type="submit"
        variant="brand"
        className="sheen h-11 font-semibold"
        loading={pending || done}
        disabled={restart}
      >
        {t("auth.reset.submit")}
      </LoadingButton>
    </form>
  );
}
