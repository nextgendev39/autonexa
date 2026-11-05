"use client";

import { ChevronLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { FOCUS_ROUTES, breadcrumbLabels, ownBreadcrumbLabels } from "@/config/routes";
import { useUserContext } from "@/hooks/use-permission";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import { canViewAllBookings } from "@/lib/permissions/roles";
import { decodeVehicleRef } from "@/lib/vehicles/routes";

/**
 * Phone header back button for child screens (a vehicle, a booking, a sub-page): the
 * parent screen's name with a chevron. Goes back through history when the visit started
 * inside the app, so the list keeps its filters and page; otherwise opens the parent.
 * Renders nothing on top-level screens and on step forms, which have their own close.
 */
export function MobileBackButton({ className }: { className?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { roles } = useUserContext();
  // Screens visited in this tab so far; more than one means history leads back into the app.
  const visits = useRef(0);
  useEffect(() => {
    visits.current += 1;
  }, [pathname]);

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || FOCUS_ROUTES.test(pathname)) return null;

  const parentSegments = segments.slice(0, -1);
  const parentHref = `/${parentSegments.join("/")}`;
  const parent = parentSegments.at(-1)!;
  const key =
    (!canViewAllBookings(roles) && ownBreadcrumbLabels[parent]) || breadcrumbLabels[parent];
  const label = key ? t(key as Parameters<typeof t>[0]) : decodeVehicleRef(parent);

  return (
    <Link
      href={parentHref}
      onClick={(event) => {
        if (visits.current > 1 && window.history.length > 1) {
          event.preventDefault();
          router.back();
        }
      }}
      aria-label={t("common.backTo", { page: label })}
      className={
        "hover:bg-muted focus-visible:ring-ring/50 -ms-2 flex h-10 min-w-0 items-center gap-0.5 rounded-lg pe-2.5 ps-1 text-sm font-medium outline-none focus-visible:ring-3 " +
        (className ?? "")
      }
    >
      <ChevronLeftIcon className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}
