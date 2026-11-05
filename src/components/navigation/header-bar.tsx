"use client";

import { useTranslations } from "next-intl";

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
    <header className="bg-background/85 supports-backdrop-filter:bg-background/70 relative z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md md:px-6 lg:px-8">
      {/* Gold pinstripe along the bottom edge. */}
      <span
        className="via-brand/50 animate-grow-x pointer-events-none absolute inset-x-0 -bottom-px h-px bg-linear-to-r from-transparent to-transparent"
        aria-hidden
      />
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
      <div className="ms-auto flex items-center gap-1.5">
        <div className="hidden items-center gap-0.5 md:flex">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>
        <NotificationMenu />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
