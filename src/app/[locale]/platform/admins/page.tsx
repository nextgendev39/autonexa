import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { InviteStaffDialog, RemoveStaffAction, StaffRoleAction } from "@/components/platform/admins-client";
import { DataTable } from "@/components/platform/data-table";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/config/app";
import { canPlatform } from "@/lib/platform/permissions";
import { listStaff } from "@/lib/platform/service";
import { requirePlatformPage } from "@/lib/platform/session";
import { formatDate } from "@/lib/utils/date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("platform");
  return { title: t("nav.admins") };
}

export default async function Page() {
  const context = await requirePlatformPage();
  const t = await getTranslations("platform");
  const locale = (await getLocale()) as AppLocale;
  const staff = await listStaff();
  const canManage = canPlatform(context, "admins.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("admins.title")}
        description={t("admins.description")}
        actions={canManage ? <InviteStaffDialog /> : null}
      />
      <Card>
        <CardContent>
          <DataTable
            empty={t("common.none")}
            headers={[t("admins.email"), t("admins.name"), t("admins.role"), t("admins.lastSignIn"), ""]}
            rows={staff.map((person) => ({
              key: person.user_id,
              cells: [
                person.email ?? "—",
                person.display_name ?? "—",
                t(`roles.${person.role}` as never),
                person.last_sign_in_at ? formatDate(person.last_sign_in_at, locale) : "—",
                // Nobody changes their own access; the database refuses it too.
                canManage && person.user_id !== context.userId ? (
                  <div key="a" className="flex gap-1">
                    <StaffRoleAction userId={person.user_id} role={person.role} email={person.email} />
                    <RemoveStaffAction userId={person.user_id} email={person.email} />
                  </div>
                ) : null,
              ],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
