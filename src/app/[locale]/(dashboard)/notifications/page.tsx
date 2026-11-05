import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NotificationList } from "@/components/notifications/notification-list";
import { requirePagePermission } from "@/lib/auth/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("modules.notifications.title") };
}

export default async function NotificationsPage() {
  await requirePagePermission("notification.view");
  return <NotificationList />;
}
