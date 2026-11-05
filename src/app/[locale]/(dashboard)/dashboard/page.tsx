import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requirePagePermission } from "@/lib/auth/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("dashboard.title") };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const context = await requirePagePermission("dashboard.view");
  const { month } = await searchParams;
  return <DashboardView context={context} month={typeof month === "string" ? month : null} />;
}
