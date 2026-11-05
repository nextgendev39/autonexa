import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { DisplayPreferences } from "@/components/settings/display-preferences";
import { PaymentTermsCard } from "@/components/settings/payment-terms-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePagePermission } from "@/lib/auth/authorize";
import { hasPermission } from "@/lib/permissions";
import { getPaymentTerms } from "@/lib/settings/payment-terms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.settings.title") };
}

export default async function SettingsPage() {
  const context = await requirePagePermission("settings.view");
  const t = await getTranslations();
  const paymentTerms = await getPaymentTerms();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("modules.settings.title")} description={t("modules.settings.description")} />
      <PaymentTermsCard
        initial={paymentTerms}
        canManage={hasPermission(context.permissions, "settings.manage", context.roles)}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.display")}</CardTitle>
          <CardDescription>{t("settings.displayHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayPreferences />
        </CardContent>
      </Card>
    </div>
  );
}
