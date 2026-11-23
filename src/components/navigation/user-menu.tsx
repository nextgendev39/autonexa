"use client";

import {
  BellIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { signOutClient } from "@/hooks/use-auth-submit";
import { Link } from "@/lib/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { UserContext } from "@/types/auth";

/**
 * Account menu. `variant="avatar"` is the compact header button; `variant="sidebar"` is the
 * identity block at the foot of the sidebar (collapsed: just the avatar).
 */
export function UserMenu({
  user,
  variant = "avatar",
  collapsed = false,
}: {
  user: UserContext;
  variant?: "avatar" | "sidebar";
  collapsed?: boolean;
}) {
  const t = useTranslations();
  const label = user.displayName || user.email || t("common.account");
  const initial = (user.displayName || user.email || "A").slice(0, 1).toUpperCase();
  const avatar = (
    <Avatar className={variant === "sidebar" ? "size-8" : "size-7"}>
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-gold text-gold-foreground text-xs font-semibold">
        {initial}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      {variant === "sidebar" ? (
        <DropdownMenuTrigger
          className={cn(
            "hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent focus-visible:ring-sidebar-ring flex w-full min-w-0 items-center gap-2.5 rounded-xl p-1.5 text-start transition-colors duration-150 outline-none focus-visible:ring-2",
            collapsed && "justify-center",
          )}
          aria-label={t("common.account")}
        >
          {avatar}
          {collapsed ? null : (
            <>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{label}</span>
                {user.email && user.displayName ? (
                  <span className="text-sidebar-foreground/55 truncate text-xs">{user.email}</span>
                ) : null}
              </span>
              <ChevronsUpDownIcon
                className="text-sidebar-foreground/45 size-4 shrink-0"
                aria-hidden
              />
            </>
          )}
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("common.account")} />}
        >
          {avatar}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align={variant === "sidebar" ? "start" : "end"}
        side={variant === "sidebar" ? "top" : "bottom"}
        className="w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5 font-normal">
            <p className="truncate font-medium">{label}</p>
            {user.email ? (
              <p className="text-muted-foreground truncate text-xs">{user.email}</p>
            ) : null}
            {user.employeeCode ? (
              <p className="text-muted-foreground truncate text-xs">{user.employeeCode}</p>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem nativeButton={false} render={<Link href="/profile" />}>
          <UserRoundIcon />
          {t("nav.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem nativeButton={false} render={<Link href="/settings" />}>
          <SettingsIcon />
          {t("nav.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem nativeButton={false} render={<Link href="/notifications" />}>
          <BellIcon />
          {t("nav.notifications")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void signOutClient()}>
          <LogOutIcon />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
