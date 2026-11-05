"use client";

import { BellIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { NotificationIcon } from "@/components/notifications/notification-icon";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { useNotificationText } from "@/components/notifications/use-notification-text";
import { useNotifications } from "@/components/providers/notification-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appConfig, isAppLocale } from "@/config/app";
import { Link } from "@/lib/i18n/navigation";
import { formatRelativeTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

export function NotificationMenu() {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : appConfig.defaultLocale;
  const { items, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const text = useNotificationText();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={t("nav.notifications")}
          />
        }
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="bg-brand text-brand-foreground absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.65rem] font-semibold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium">{t("notifications.title")}</p>
            <p className="text-muted-foreground text-xs">
              {t("notifications.unread", { count: unreadCount })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {unreadCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                {t("notifications.markAllRead")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={clearAll}
              disabled={items.length === 0}
            >
              {t("notifications.clearAll")}
            </Button>
          </div>
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <li className="text-muted-foreground px-3 py-6 text-center text-sm">
              {t("empty.notifications")}
            </li>
          ) : (
            items.slice(0, 20).map((item) => (
              <li key={item.id} className="border-b last:border-b-0">
                <Link
                  href={item.href}
                  onClick={() => markRead(item.id)}
                  className={cn(
                    "hover:bg-muted focus-visible:bg-muted flex items-start gap-3 px-3 py-3 outline-none",
                    !item.read && "bg-brand/8",
                  )}
                >
                  <NotificationIcon type={item.type} className="size-8 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{text(item).title}</span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {text(item).body}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {formatRelativeTime(item.createdAt, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
        <div className="grid gap-1 border-t p-2">
          <PushPrompt className="w-full" />
          <Button
            variant="ghost"
            className="w-full"
            nativeButton={false}
            render={<Link href="/notifications" />}
          >
            {t("common.viewAll")}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
