import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BranchesPageClient } from "@/components/branches/branches-page-client";
import { requirePagePermission } from "@/lib/auth/authorize";
import { listBranchesForUser } from "@/lib/branches/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.branches.title") };
}

export default async function Page() {
  const context = await requirePagePermission("branch.view");
  const branches = await listBranchesForUser();

  return (
    <BranchesPageClient
      initialBranches={branches}
      canManage={context.roles.includes("super_admin")}
    />
  );
}
