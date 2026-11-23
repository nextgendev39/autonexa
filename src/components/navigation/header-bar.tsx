"use client";

import { useTranslations } from "next-intl";

import { HeaderBreadcrumbs } from "@/components/navigation/header-breadcrumbs";
import { LanguageSwitcher } from "@/components/navigation/language-switcher";
import { MobileBackButton } from "@/components/navigation/mobile-back-button";
import { NotificationMenu } from "@/components/navigation/notification-menu";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { UserMenu } from "@/components/navigation/user-menu";
import { BrandMark } from "@/components/shared/brand-mark";
import { FOCUS_ROUTES } from "@/config/routes";
import { usePathname } from "@/lib/i18n/navigation";
import type { UserContext } from "@/types/auth";

export function HeaderBar({ user }: { user: UserContext }) {
  const t = useTranslations();
  const pathname = usePathname();
  // Child screens get a back button in place of the logo; step forms have their own close.
  const child = pathname.split("/").filter(Boolean).length > 1 && !FOCUS_ROUTES.test(pathname);

  return (
    <header className="bg-background/85 supports-backdrop-filter:bg-background/70 border-divider relative z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md md:px-6 lg:px-10">
      <div className="min-w-0 lg:hidden">
        {/* Always mounted so it remembers in-app visits; renders only on child screens. */}
        <MobileBackButton />
        {child ? null : (
          <>
            <BrandMark showName={false} />
            <span className="sr-only">{t("app.name")}</span>
          </>
        )}
      </div>
      <HeaderBreadcrumbs />
      <div className="ms-auto flex items-center gap-2">
        <div className="border-border bg-card hidden items-center rounded-full border p-0.5 shadow-xs md:flex [&>*>button]:size-8 [&>*>button]:rounded-full [&>button]:size-8 [&>button]:rounded-full">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>
        <NotificationMenu />
        <div className="lg:hidden">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
