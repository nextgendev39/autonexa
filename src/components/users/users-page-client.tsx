"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BadgeDollarSignIcon,
  CalculatorIcon,
  CirclePauseIcon,
  CircleUserRoundIcon,
  MailIcon,
  PencilIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  TruckIcon,
  UserCheckIcon,
  UserXIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { KpiCard } from "@/components/cards/kpi-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Spinner } from "@/components/shared/spinner";
import { TabCount } from "@/components/shared/tab-count";
import { ResponsiveTable } from "@/components/tables/responsive-table";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import { roleLabel } from "@/components/users/role-label";
import { UserStatusDialog, type StatusAction } from "@/components/users/user-status-dialog";
import type { AppLocale } from "@/config/app";
import { postAuthJson } from "@/lib/auth/client";
import type { RoleOption, UserListItem } from "@/lib/users/service";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

type Props = {
  initialUsers: UserListItem[];
  roles: RoleOption[];
  currentUserId: string;
};

type Filter = "active" | "invited" | "suspended" | "inactive";

const FILTERS: Filter[] = ["active", "invited", "suspended", "inactive"];

const STATUS_LABEL_KEY: Record<UserListItem["status"], string> = {
  active: "statusActive",
  invited: "statusInvited",
  suspended: "statusSuspended",
  disabled: "statusDisabled",
};

const ROLE_ICONS: Record<string, LucideIcon> = {
  super_admin: ShieldCheckIcon,
  accountant: CalculatorIcon,
  sales_executive: BadgeDollarSignIcon,
  logistics: TruckIcon,
};

const isSuperAdmin = (user: UserListItem) => user.roles.some((r) => r.key === "super_admin");

// Inactive = deactivated (disabled); suspended users get their own tab.
const matchesFilter = (user: UserListItem, filter: Filter) =>
  filter === "inactive" ? user.status === "disabled" : user.status === filter;

export function UsersPageClient({ initialUsers, roles, currentUserId }: Props) {
  const t = useTranslations("modules.users");
  const tRoot = useTranslations();
  const locale = useLocale() as AppLocale;
  const [users, setUsers] = useState(initialUsers);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [statusUser, setStatusUser] = useState<UserListItem | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction>("deactivate");
  const [statusOpen, setStatusOpen] = useState(false);
  const [resendingIds, setResendingIds] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/users", { credentials: "same-origin" });
    if (res.ok) {
      const data: UserListItem[] = await res.json();
      setUsers(data);
    }
  }, []);

  const role = useCallback(
    (r: { key: string; name: string }) => roleLabel(r, (k) => t(k as Parameters<typeof t>[0])),
    [t],
  );
  const number = (value: number) => formatNumber(value, locale);

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((u) => matchesFilter(u, "active")).length,
      invited: users.filter((u) => matchesFilter(u, "invited")).length,
      suspended: users.filter((u) => matchesFilter(u, "suspended")).length,
      inactive: users.filter((u) => matchesFilter(u, "inactive")).length,
      admins: users.filter(isSuperAdmin).length,
    }),
    [users],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((user) => {
      if (!matchesFilter(user, filter)) return false;
      if (!term) return true;
      return [user.displayName, user.email ?? "", ...user.roles.map(role)]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [users, filter, query, role]);

  const openEdit = (user: UserListItem) => {
    setEditUser(user);
    setEditOpen(true);
  };
  const openStatusChange = (user: UserListItem, action: StatusAction) => {
    setStatusUser(user);
    setStatusAction(action);
    setStatusOpen(true);
  };

  const resendInvitation = async (user: UserListItem) => {
    if (resendingIds.has(user.id)) return;
    setResendingIds((prev) => new Set(prev).add(user.id));
    const result = await postAuthJson(`/api/users/${user.id}/resend-invitation`, {});
    setResendingIds((prev) => {
      const next = new Set(prev);
      next.delete(user.id);
      return next;
    });

    if (result.status === "success") {
      toast.success(t("resendSuccess", { email: user.email ?? user.displayName }));
      return;
    }
    toast.error(
      tRoot(
        (result.formError ?? "modules.users.errors.resendFailed") as Parameters<typeof tRoot>[0],
      ),
    );
    // Accepted in the meantime: pull the fresh status so the action disappears.
    if (result.formError === "modules.users.errors.invitationAccepted") void refresh();
  };

  const actions = (user: UserListItem) => {
    const resending = resendingIds.has(user.id);
    return (
      <div className="flex items-center justify-end gap-1" data-row-stop>
        {user.status === "invited" ? (
          <Button
            variant="outline"
            size="sm"
            className="hover:text-brand hover:border-brand/40"
            onClick={() => resendInvitation(user)}
            disabled={resending}
            aria-busy={resending || undefined}
            aria-label={t("resendAria", { name: user.displayName })}
            title={t("resendAria", { name: user.displayName })}
          >
            {resending ? <Spinner /> : <SendIcon />}
            {t("resendInvite")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:text-brand"
          onClick={() => openEdit(user)}
          aria-label={t("editAria", { name: user.displayName })}
          title={t("editAria", { name: user.displayName })}
        >
          <PencilIcon />
        </Button>
        {user.status === "active" && user.id !== currentUserId ? (
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
            onClick={() => openStatusChange(user, "deactivate")}
            aria-label={t("deactivateAria", { name: user.displayName })}
            title={t("deactivateAria", { name: user.displayName })}
          >
            <UserXIcon />
            {t("deactivateConfirm")}
          </Button>
        ) : null}
        {user.status === "suspended" || user.status === "disabled" ? (
          <Button
            variant="outline"
            size="sm"
            className="hover:text-brand hover:border-brand/40"
            onClick={() => openStatusChange(user, "activate")}
            aria-label={t("activateAria", { name: user.displayName })}
            title={t("activateAria", { name: user.displayName })}
          >
            <UserCheckIcon />
            {t("activate")}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<InviteUserDialog roles={roles} onSuccess={refresh} />}
      />

      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t("noUsers")} />
      ) : (
        <>
          <section className="stagger grid grid-cols-2 gap-3 [--stagger:70ms] lg:grid-cols-4 lg:gap-4">
            <KpiCard
              label={t("kpis.total")}
              value={number(counts.all)}
              icon={UsersIcon}
              tone="brand"
            />
            <KpiCard
              label={t("kpis.active")}
              value={number(counts.active)}
              hint={t("kpis.activeHint")}
              icon={UserCheckIcon}
              tone="success"
            />
            <KpiCard
              label={t("kpis.invited")}
              value={number(counts.invited)}
              hint={t("kpis.invitedHint")}
              icon={MailIcon}
              tone={counts.invited > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              label={t("kpis.admins")}
              value={number(counts.admins)}
              icon={ShieldCheckIcon}
              tone="neutral"
            />
          </section>

          <div className="animate-rise flex flex-col gap-3 [animation-delay:160ms] md:flex-row md:items-center md:justify-between">
            <div
              className="bg-muted flex w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg p-0.5 text-sm md:w-fit"
              role="tablist"
            >
              {FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap transition-all duration-200 md:flex-none",
                    filter === key
                      ? "bg-background font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`filters.${key}`)}
                  <TabCount selected={filter === key}>{number(counts[key])}</TabCount>
                </button>
              ))}
            </div>
            <InputGroup className="bg-card h-10 md:h-9 md:max-w-xs">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={() => setQuery("")}
                    aria-label={t("clearSearch")}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>

          {visible.length === 0 ? (
            query.trim() ? (
              <EmptyState
                icon={SearchIcon}
                title={t("noMatches")}
                description={t("noMatchesHint")}
              />
            ) : (
              <EmptyState
                icon={
                  filter === "inactive"
                    ? UserXIcon
                    : filter === "suspended"
                      ? CirclePauseIcon
                      : filter === "invited"
                        ? MailIcon
                        : UsersIcon
                }
                title={t(`empty.${filter}`)}
                description={t(`empty.${filter}Hint`)}
              />
            )
          ) : (
            <ResponsiveTable
              rows={visible}
              columns={[
                {
                  key: "name",
                  header: t("name"),
                  className: "ps-4",
                  cell: (user) => <UserIdentity user={user} />,
                },
                {
                  key: "role",
                  header: t("role"),
                  cell: (user) => <RoleList user={user} label={role} />,
                },
                {
                  key: "status",
                  header: t("status"),
                  cell: (user) => <UserStatus status={user.status} />,
                },
                {
                  key: "lastSignIn",
                  header: t("lastSignIn"),
                  className: "hidden whitespace-nowrap lg:table-cell",
                  cell: (user) => (
                    <div className="grid gap-0.5">
                      <span className={user.lastSignInAt ? undefined : "text-muted-foreground"}>
                        {user.lastSignInAt
                          ? formatDate(user.lastSignInAt, locale, "short")
                          : t("neverSignedIn")}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t("joinedOn", { date: formatDate(user.createdAt, locale, "short") })}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "actions",
                  header: <span className="sr-only">{t("editTitle")}</span>,
                  className: "pe-4 text-end",
                  cell: actions,
                },
              ]}
              renderCard={(user) => (
                <article
                  key={user.id}
                  className="bg-card grid gap-3 rounded-xl border p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <UserIdentity user={user} />
                    {actions(user)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <UserStatus status={user.status} />
                    <RoleList user={user} label={role} />
                  </div>
                  <p className="text-muted-foreground border-t pt-3 text-xs">
                    {t("lastSignIn")}:{" "}
                    {user.lastSignInAt
                      ? formatDate(user.lastSignInAt, locale, "short")
                      : t("neverSignedIn")}
                  </p>
                </article>
              )}
            />
          )}
        </>
      )}

      <EditUserDialog
        user={editUser}
        open={editOpen}
        onOpenChange={setEditOpen}
        roles={roles}
        onSuccess={refresh}
      />

      <UserStatusDialog
        user={statusUser}
        action={statusAction}
        open={statusOpen}
        onOpenChange={setStatusOpen}
        onChanged={(id, status) =>
          setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)))
        }
      />
    </div>
  );
}

/** Initials avatar: gold for Super Admins, carbon with gold letters for everyone else. */
function UserAvatar({ user }: { user: UserListItem }) {
  const parts = user.displayName.trim().split(/\s+/).filter(Boolean);
  const initials = (
    parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : user.displayName.slice(0, 2)
  ).toUpperCase();
  const admin = isSuperAdmin(user);
  return (
    <span className="relative shrink-0">
      <span
        className={cn(
          "font-heading flex size-10 items-center justify-center rounded-full text-sm font-semibold shadow-sm",
          admin ? "bg-gold text-brand-foreground" : "bg-carbon ring-brand/30 ring-1",
          user.status !== "active" && "opacity-60",
        )}
      >
        {initials ? (
          <span className={admin ? undefined : "text-gold"}>{initials}</span>
        ) : (
          <CircleUserRoundIcon className="size-5" aria-hidden />
        )}
      </span>
      {user.status === "active" ? (
        <span
          className="bg-brand ring-card absolute -end-0.5 -bottom-0.5 size-3 rounded-full ring-2"
          aria-hidden
        />
      ) : null}
    </span>
  );
}

function UserIdentity({ user }: { user: UserListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar user={user} />
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate font-semibold">{user.displayName}</span>
        <span className="text-muted-foreground truncate text-xs" dir="ltr">
          {user.email ?? "—"}
        </span>
      </div>
    </div>
  );
}

/** Role chips with an icon each; Super Admin is the gold one. */
function RoleList({
  user,
  label,
}: {
  user: UserListItem;
  label: (r: { key: string; name: string }) => string;
}) {
  if (user.roles.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.roles.map((r) => {
        const Icon = ROLE_ICONS[r.key] ?? CircleUserRoundIcon;
        const admin = r.key === "super_admin";
        return (
          <span
            key={r.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
              admin
                ? "bg-gold text-brand-foreground shadow-sm"
                : "bg-muted text-foreground/80 ring-foreground/10 ring-1 ring-inset",
            )}
          >
            <Icon
              className={cn("size-3.5", !admin && "text-brand-strong dark:text-brand")}
              aria-hidden
            />
            {label(r)}
          </span>
        );
      })}
    </div>
  );
}

/** Active: gold live dot. Invited: amber with a mail icon. Suspended / disabled: muted. */
function UserStatus({ status }: { status: UserListItem["status"] }) {
  const t = useTranslations("modules.users");
  const label = t(STATUS_LABEL_KEY[status] as Parameters<typeof t>[0]);
  const pill =
    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset";

  if (status === "active") {
    return (
      <span className={cn(pill, "bg-brand-soft text-brand-strong ring-brand/35 dark:text-brand")}>
        <span className="relative flex size-1.5" aria-hidden>
          <span className="animate-ping-soft bg-brand absolute inset-0 rounded-full motion-reduce:hidden" />
          <span className="bg-brand relative size-1.5 rounded-full" />
        </span>
        {label}
      </span>
    );
  }
  if (status === "invited") {
    return (
      <span
        className={cn(pill, "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300")}
      >
        <MailIcon className="size-3.5" aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <span className={cn(pill, "bg-muted text-muted-foreground ring-foreground/10")}>
      <span className="bg-muted-foreground/60 size-1.5 rounded-full" aria-hidden />
      {label}
    </span>
  );
}
