import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requirePagePermission } from "@/lib/auth/authorize";
import { listRoles, listUsers } from "@/lib/users/service";
import { UsersPageClient } from "@/components/users/users-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.users.title") };
}

export default async function Page() {
  const context = await requirePagePermission("user.manage");

  const [users, roles] = await Promise.all([listUsers(), listRoles()]);

  return <UsersPageClient initialUsers={users} roles={roles} currentUserId={context.userId} />;
}
