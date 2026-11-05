"use client";

import { BellIcon, LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react";
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
import type { UserContext } from "@/types/auth";

export function UserMenu({ user }: { user: UserContext }) {
  const t = useTranslations();
  const label = user.displayName || user.email || t("common.account");
  const initial = (user.displayName || user.email || "Z").slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={t("common.account")} />}
      >
        <Avatar className="size-7">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5 font-normal">
            <p className="truncate font-medium">{label}</p>
            {user.email ? <p className="text-muted-foreground truncate text-xs">{user.email}</p> : null}
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
