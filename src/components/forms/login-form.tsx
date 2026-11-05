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
import { loginSchema, type LoginValues } from "@/lib/validation";

export function LoginForm() {
  const t = useTranslations();
  const translate = useTranslatedMessage();
  const [showPassword, setShowPassword] = useState(false);
  const { state, pending, submit } = useAuthSubmit("/api/auth/login");
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    for (const [key, message] of Object.entries(state.fieldErrors)) {
      form.setError(key as keyof LoginValues, { message });
    }
  }, [state, form]);

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit((values) => {
        void submit(values);
      })}
      noValidate
    >
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{translate(state.formError)}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        label={t("auth.login.email")}
        htmlFor="email"
        error={form.formState.errors.email?.message}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="h-11 md:h-10"
          aria-invalid={Boolean(form.formState.errors.email) || undefined}
          aria-describedby={form.formState.errors.email ? "email-error" : undefined}
          {...form.register("email")}
        />
      </FormField>
      <FormField
        label={t("auth.login.password")}
        htmlFor="password"
        error={form.formState.errors.password?.message}
      >
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="h-11 pe-11 md:h-10"
            aria-invalid={Boolean(form.formState.errors.password) || undefined}
            aria-describedby={form.formState.errors.password ? "password-error" : undefined}
            {...form.register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute end-1 top-1/2 -translate-y-1/2"
            aria-label={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </div>
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm underline-offset-4 hover:underline">
          {t("auth.login.forgot")}
        </Link>
      </div>
      <LoadingButton type="submit" variant="brand" className="sheen h-11 font-semibold" loading={pending}>
        {t("auth.login.submit")}
      </LoadingButton>
    </form>
  );
}
