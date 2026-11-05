"use client";

import { useMemo, useState } from "react";
import {
  BellIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/feedback/empty-state";
import { useAppLocale } from "@/components/inventory/inventory-utils";
import { PageHeader } from "@/components/layout/page-header";
import {
  NotificationIcon,
  notificationCategory,
  type NotificationCategory,
} from "@/components/notifications/notification-icon";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { useNotificationText } from "@/components/notifications/use-notification-text";
import { useNotifications } from "@/components/providers/notification-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";
import { formatDate, formatRelativeTime } from "@/lib/utils/date";

import type { AppNotification } from "@/types/notification";

type ReadFilter = "all" | "unread";
type DayGroup = "today" | "yesterday" | "thisWeek" | "older";

const CATEGORIES: NotificationCategory[] = [
  "booking",
  "ready",
  "sale",
  "cancellation",
  "payment",
  "other",
];

/** Calendar day in the viewer's zone, as a UTC midnight timestamp. */
function dayStamp(value: Date, timeZone: string) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(value)
    .split("-")
    .map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayGroup(createdAt: string, today: number, timeZone: string): DayGroup {
  const days = Math.round((today - dayStamp(new Date(createdAt), timeZone)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "thisWeek";
  return "older";
}

export function NotificationList() {
  const t = useTranslations("notifications");
  const tm = useTranslations("modules.notifications");
  const te = useTranslations("empty");
  const locale = useAppLocale();
  const timeZone = useViewerTimeZone();
  const { items, updatedAt, markRead, markAllRead, clearAll, unreadCount } = useNotifications();
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const present = useMemo(
    () => CATEGORIES.filter((key) => items.some((item) => notificationCategory(item.type) === key)),
    [items],
  );
  // A category can vanish after Clear all or a refresh; fall back to everything.
  const activeCategory = category !== "all" && present.includes(category) ? category : "all";

  const groups = useMemo(() => {
    const today = dayStamp(new Date(updatedAt), timeZone);
    const byDay = new Map<DayGroup, AppNotification[]>();
    for (const item of items) {
      if (readFilter === "unread" && item.read) continue;
      if (activeCategory !== "all" && notificationCategory(item.type) !== activeCategory) continue;
      const key = dayGroup(item.createdAt, today, timeZone);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return (["today", "yesterday", "thisWeek", "older"] as const)
      .filter((key) => byDay.has(key))
      .map((key) => ({ key, items: byDay.get(key)! }));
  }, [items, readFilter, activeCategory, updatedAt, timeZone]);

  const number = (value: number) => formatNumber(value, locale);
  const readCounts: Record<ReadFilter, number> = { all: items.length, unread: unreadCount };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={tm("title")}
        description={tm("description")}
        actions={
          <>
            <PushPrompt />
            <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheckIcon />
              {t("markAllRead")}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmClear(true)}
              disabled={items.length === 0}
            >
              <Trash2Icon />
              {t("clearAll")}
            </Button>
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={BellIcon}
          title={te("notifications")}
          description={te("notificationsHint")}
        />
      ) : (
        <>
          <div className="animate-rise flex flex-col gap-3 [animation-delay:120ms] md:flex-row md:items-center md:justify-between">
            <div
              className="bg-muted flex w-full rounded-lg p-0.5 text-sm md:w-fit"
              role="tablist"
              aria-label={t("title")}
            >
              {(["all", "unread"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={readFilter === key}
                  onClick={() => setReadFilter(key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap transition-all duration-200 md:flex-none",
                    readFilter === key
                      ? "bg-background font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`filters.${key}`)}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      key === "unread" && readCounts.unread > 0
                        ? "bg-brand text-brand-foreground font-semibold"
                        : "text-muted-foreground",
                    )}
                  >
                    {number(readCounts[key])}
                  </span>
                </button>
              ))}
            </div>

            {present.length > 1 ? (
              <div
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
                aria-label={t("filters.type")}
              >
                {(["all", ...present] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={activeCategory === key}
                    onClick={() => setCategory(key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                      activeCategory === key
                        ? "border-foreground bg-foreground text-background"
                        : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {t(`categories.${key}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {groups.length === 0 ? (
            readFilter === "unread" && activeCategory === "all" ? (
              <EmptyState
                icon={CheckCheckIcon}
                title={t("caughtUp")}
                description={t("caughtUpHint")}
              />
            ) : (
              <EmptyState icon={SearchIcon} title={t("noMatches")} />
            )
          ) : (
            <div className="stagger flex flex-col gap-6 [--stagger:60ms]">
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`notifications-${group.key}`}>
                  <h2
                    id={`notifications-${group.key}`}
                    className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-xs font-semibold tracking-wide uppercase"
                  >
                    {t(`groups.${group.key}`)}
                    <span className="bg-muted rounded-full px-1.5 py-px font-medium tabular-nums">
                      {number(group.items.length)}
                    </span>
                  </h2>
                  <ul className="bg-card ring-foreground/[0.07] divide-y overflow-hidden rounded-xl shadow-xs ring-1">
                    {group.items.map((item) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        onRead={() => markRead(item.id)}
                        timeZone={timeZone}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearTitle")}</DialogTitle>
            <DialogDescription>{t("clearDescription", { count: items.length })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6" showCloseButton>
            <Button
              variant="destructive"
              onClick={() => {
                clearAll();
                setConfirmClear(false);
              }}
            >
              <Trash2Icon />
              {t("clearAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotificationRow({
  item,
  onRead,
  timeZone,
}: {
  item: AppNotification;
  onRead: () => void;
  timeZone: string;
}) {
  const t = useTranslations("notifications");
  const locale = useAppLocale();
  const { title, body } = useNotificationText()(item);

  return (
    <li className={cn("group/row relative transition-colors", !item.read && "bg-brand/[0.045]")}>
      {!item.read ? (
        <span className="bg-brand absolute inset-y-0 start-0 w-0.5" aria-hidden />
      ) : null}
      <Link
        href={item.href}
        onClick={onRead}
        className="hover:bg-muted/60 focus-visible:bg-muted flex items-start gap-3 py-3.5 ps-4 pe-14 outline-none sm:gap-4 sm:ps-5"
      >
        <span className="relative">
          <NotificationIcon type={item.type} />
          {!item.read ? (
            <span className="bg-brand ring-card absolute -end-0.5 -top-0.5 size-2.5 rounded-full ring-2" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm",
              item.read ? "text-foreground/80 font-medium" : "font-semibold",
            )}
          >
            {!item.read ? <span className="sr-only">{t("unreadLabel")} </span> : null}
            {title}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-sm text-pretty">{body}</span>
          <time
            dateTime={item.createdAt}
            title={formatDate(item.createdAt, locale, "dateTimeZone", timeZone)}
            className="text-muted-foreground/80 mt-1.5 block text-xs"
          >
            {formatRelativeTime(item.createdAt, locale)}
          </time>
        </span>
      </Link>
      <div className="absolute end-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center">
        {!item.read ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:text-brand"
            onClick={onRead}
            aria-label={t("markRead")}
            title={t("markRead")}
          >
            <CheckIcon />
          </Button>
        ) : (
          <ChevronRightIcon
            className="text-muted-foreground/50 group-hover/row:text-foreground pointer-events-none size-4 transition-transform group-hover/row:translate-x-0.5 rtl:rotate-180 rtl:group-hover/row:-translate-x-0.5"
            aria-hidden
          />
        )}
      </div>
    </li>
  );
}
