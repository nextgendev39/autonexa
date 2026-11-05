import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.forgot.title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.forgot.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.forgot.description")}</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
