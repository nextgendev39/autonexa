import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DocumentsPageClient } from "@/components/documents/documents-page-client";
import { ErrorState } from "@/components/feedback/error-state";
import { requirePagePermission } from "@/lib/auth/authorize";
import { listStaffDocuments } from "@/lib/staff-documents/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("documents.title") };
}

export default async function DocumentsPage() {
  const context = await requirePagePermission("document.view");
  const result = await listStaffDocuments(context, "mine");
  if (result.error) {
    console.error("[documents] list failed:", result.error.code, result.error.message);
    return <ErrorState />;
  }
  return <DocumentsPageClient initialDocuments={result.data} canViewAll={context.roles.includes("super_admin")} />;
}
