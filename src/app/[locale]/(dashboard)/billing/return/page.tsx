import type { Metadata } from "next";
import { CheckCircle2Icon, ClockIcon, CircleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/authorize";
import { confirmCheckout } from "@/lib/billing/service";
import { Link } from "@/lib/i18n/navigation";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("return.title") };
}

/**
 * Where the gateway sends someone back to. Arriving here proves nothing. It asks the gateway itself, so
 * opening this address by hand can't activate anything.
 */
export default async function Page({ searchParams }: Props) {
  await requirePagePermission("billing.manage");
  const t = await getTranslations("billing");
  const { checkout } = await searchParams;
  const id = typeof checkout === "string" && /^[0-9a-f-]{36}$/.test(checkout) ? checkout : null;
  let status: string | null = null;
  if (id) {
    try {
      status = await confirmCheckout(id);
    } catch (error) {
      console.error("[billing] could not confirm a checkout", error);
      status = "open";
    }
  }
  const paid = status === "paid";
  const pending = status === "open";
  const Icon = paid ? CheckCircle2Icon : pending ? ClockIcon : CircleAlertIcon;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t("return.title")} />
      <Alert variant={paid || pending ? "default" : "destructive"}>
        <Icon />
        <AlertDescription>
          {t(paid ? "return.paid" : pending ? "return.pending" : status === "needs_review" ? "return.review" : "return.notPaid")}
        </AlertDescription>
      </Alert>
      <div>
        <Button nativeButton={false} render={<Link href="/billing" />}>
          {t("return.back")}
        </Button>
      </div>
    </div>
  );
}
