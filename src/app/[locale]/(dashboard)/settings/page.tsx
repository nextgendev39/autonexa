import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ConsoleLayout } from "@/components/layout/section-index";
import { PageHeader } from "@/components/layout/page-header";
import { DisplayPreferences } from "@/components/settings/display-preferences";
import { PaymentTermsCard } from "@/components/settings/payment-terms-card";
import { PlanCard } from "@/components/settings/plan-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePagePermission } from "@/lib/auth/authorize";
import { hasPermission } from "@/lib/permissions";
import { getDealershipPlan, listOwnInvoices } from "@/lib/platform/dealership";
import { getPaymentTerms } from "@/lib/settings/payment-terms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.settings.title") };
}

export default async function SettingsPage() {
  const context = await requirePagePermission("settings.view");
  const t = await getTranslations();
  const [paymentTerms, plan, invoices] = await Promise.all([
    getPaymentTerms(),
    getDealershipPlan(),
    listOwnInvoices(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        title={t("modules.settings.title")}
        description={t("modules.settings.description")}
      />
      <ConsoleLayout
        label={t("modules.settings.title")}
        sections={[
          { id: "payment-terms", title: t("settings.paymentTerms.title") },
          ...(plan ? [{ id: "plan", title: t("platform.dealership.title") }] : []),
          { id: "display", title: t("settings.display") },
        ]}
      >
        <div id="payment-terms">
          <PaymentTermsCard
            initial={paymentTerms}
            canManage={hasPermission(context.permissions, "settings.manage", context.roles)}
          />
        </div>
        {plan ? (
          <div id="plan">
            <PlanCard plan={plan} invoices={invoices} />
          </div>
        ) : null}
        <Card id="display">
          <CardHeader>
            <CardTitle>{t("settings.display")}</CardTitle>
            <CardDescription>{t("settings.displayHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DisplayPreferences />
          </CardContent>
        </Card>
      </ConsoleLayout>
    </div>
  );
}
