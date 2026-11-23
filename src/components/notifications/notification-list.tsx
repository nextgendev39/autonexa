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

import { DataPanel } from "@/components/layout/data-panel";
import { Chip, ChipTabs } from "@/components/ui/chip";
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
        <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          {/* Filter rail: read state, then categories. */}
          <aside className="bg-card rounded-panel animate-rise grid gap-4 border p-4 shadow-sm lg:sticky lg:top-0">
            <div className="grid gap-2">
              <p className="eyebrow text-muted-foreground">{t("title")}</p>
              <ChipTabs
                label={t("title")}
                value={readFilter}
                onChange={setReadFilter}
                className="lg:flex-wrap"
                items={(["all", "unread"] as const).map((key) => ({
                  value: key,
                  label: t(`filters.${key}`),
                  count: number(readCounts[key]),
                  alert: key === "unread" && readCounts.unread > 0,
                }))}
              />
            </div>
            {present.length > 1 ? (
              <div className="grid gap-2">
                <p className="eyebrow text-muted-foreground">{t("filters.type")}</p>
                <div
                  className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:flex-wrap lg:overflow-visible"
                  aria-label={t("filters.type")}
                >
                  {(["all", ...present] as const).map((key) => (
                    <Chip
                      key={key}
                      selected={activeCategory === key}
                      onClick={() => setCategory(key)}
                    >
                      {t(`categories.${key}`)}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

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
            <DataPanel className="animate-rise [animation-delay:80ms]">
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`notifications-${group.key}`}>
                  <h2
                    id={`notifications-${group.key}`}
                    className="eyebrow text-muted-foreground bg-muted/45 border-divider flex items-center gap-2 border-b px-4 py-2 not-first:border-t"
                  >
                    {t(`groups.${group.key}`)}
                    <span className="bg-card text-muted-foreground rounded-full border px-1.5 text-[10px] tabular-nums">
                      {number(group.items.length)}
                    </span>
                  </h2>
                  <ul className="divide-divider divide-y">
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
            </DataPanel>
          )}
        </div>
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
