import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BootstrapAdminForm } from "@/components/forms/bootstrap-admin-form";
import { isBootstrapEnabled } from "@/lib/auth/bootstrap-config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.bootstrap.title"), robots: { index: false, follow: false } };
}

export default async function BootstrapAdminPage() {
  if (!isBootstrapEnabled()) notFound();

  const t = await getTranslations();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.bootstrap.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.bootstrap.description")}</p>
      </div>
      <BootstrapAdminForm />
    </div>
  );
}
