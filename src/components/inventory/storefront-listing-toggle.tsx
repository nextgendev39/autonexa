"use client";

import { useQueryClient } from "@tanstack/react-query";
import { GlobeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { platformRequest } from "@/components/platform/platform-ui";
import { Switch } from "@/components/ui/switch";
import { vehicleKeys } from "@/hooks/use-vehicles";
import { usePermission } from "@/hooks/use-permission";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { VehicleDetail } from "@/types/vehicle";

/** Sold, delivered and archived cars can't be listed: they'd never show anyway. */
const UNLISTABLE = new Set(["sold", "delivered", "archived"]);

/**
 * "Show on storefront" on the car itself. Same endpoint and database function as the website
 * manager, so permission, branch and plan are checked in one place, on the server.
 */
export function StorefrontListingToggle({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations("storefrontAdmin");
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  if (!can("storefront.manage") || UNLISTABLE.has(vehicle.status)) return null;
  const published = optimistic ?? vehicle.storefrontPublished;

  async function change(next: boolean) {
    setPending(true);
    setOptimistic(next);
    const outcome = await platformRequest(
      `/api/dealership-storefront/vehicles/${vehicle.id}`,
      "POST",
      { published: next },
    );
    setPending(false);
    if (!outcome.ok) {
      setOptimistic(null);
      toast.error(outcome.message || t("failed"));
      return;
    }
    toast.success(t("saved"));
    await queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicle.id) });
    setOptimistic(null);
  }

  return (
    <div
      className={cn(
        "bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3.5 transition-colors",
        published ? "border-brand/40" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          published
            ? "bg-brand-soft text-brand-strong dark:text-brand"
            : "bg-muted text-muted-foreground",
        )}
      >
        <GlobeIcon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={`storefront-${vehicle.id}`} className="text-sm font-semibold">
          {t("inventory.label")}
        </label>
        <p className="text-muted-foreground text-xs text-pretty">
          {published ? t("inventory.on") : t("inventory.off")} · {t("inventory.hint")}
        </p>
      </div>
      <Link
        href="/storefront"
        className="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
      >
        {t("inventory.manage")}
      </Link>
      <Switch
        id={`storefront-${vehicle.id}`}
        checked={published}
        disabled={pending}
        onCheckedChange={(checked) => void change(checked)}
      />
    </div>
  );
}
