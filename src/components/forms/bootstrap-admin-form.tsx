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
import { bootstrapAdminSchema, type BootstrapAdminValues } from "@/lib/validation";

export function BootstrapAdminForm() {
  const t = useTranslations();
  const translate = useTranslatedMessage();
  const { state, pending, submit } = useAuthSubmit("/api/auth/bootstrap");
  const form = useForm<BootstrapAdminValues>({
    resolver: zodResolver(bootstrapAdminSchema),
    defaultValues: {
      secret: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    for (const [key, message] of Object.entries(state.fieldErrors)) {
      form.setError(key as keyof BootstrapAdminValues, { message });
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
          <AlertDescription>
            {translate(state.formError)}
            {state.details ? (
              <span className="mt-1 block font-mono text-xs opacity-80">{state.details}</span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <FormField
        label={t("auth.bootstrap.secret")}
        htmlFor="secret"
        error={form.formState.errors.secret?.message}
      >
        <Input
          id="secret"
          type="password"
          autoComplete="off"
          className="h-11 md:h-10"
          {...form.register("secret")}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("auth.bootstrap.firstName")}
          htmlFor="firstName"
          error={form.formState.errors.firstName?.message}
        >
          <Input id="firstName" className="h-11 md:h-10" {...form.register("firstName")} />
        </FormField>
        <FormField
          label={t("auth.bootstrap.lastName")}
          htmlFor="lastName"
          error={form.formState.errors.lastName?.message}
        >
          <Input id="lastName" className="h-11 md:h-10" {...form.register("lastName")} />
        </FormField>
      </div>
      <FormField
        label={t("auth.bootstrap.email")}
        htmlFor="email"
        error={form.formState.errors.email?.message}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="h-11 md:h-10"
          {...form.register("email")}
        />
      </FormField>
      <FormField
        label={t("auth.bootstrap.password")}
        htmlFor="password"
        error={form.formState.errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          className="h-11 md:h-10"
          {...form.register("password")}
        />
      </FormField>
      <FormField
        label={t("auth.bootstrap.confirm")}
        htmlFor="confirmPassword"
        error={form.formState.errors.confirmPassword?.message}
      >
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="h-11 md:h-10"
          {...form.register("confirmPassword")}
        />
      </FormField>
      <LoadingButton type="submit" variant="brand" className="sheen h-11 font-semibold" loading={pending}>
        {t("auth.bootstrap.submit")}
      </LoadingButton>
    </form>
  );
}
