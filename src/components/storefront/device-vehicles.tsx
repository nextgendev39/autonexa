"use client";

import Link from "next/link";
import { HeartIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { clearList, useDeviceList, type DeviceList } from "@/components/storefront/device-lists";
import { VehicleCard } from "@/components/storefront/vehicle-card";
import type { AppLocale } from "@/config/app";
import type { PublicVehicle } from "@/lib/storefront/public-vehicle";

/** Loads the public cards for stock numbers kept in this browser. Unlisted cars just drop out. */
function useDeviceVehicles(list: DeviceList, api: string, exclude?: string) {
  const stock = useDeviceList(list).filter((value) => value !== exclude);
  const key = stock.join(",");
  const [state, setState] = useState<{ key: string; vehicles: PublicVehicle[] } | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`${api}/vehicles?stock=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { vehicles?: PublicVehicle[] } } | null) =>
        setState({ key, vehicles: body?.data?.vehicles ?? [] }),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [api, key]);

  if (!key) return { vehicles: [] as PublicVehicle[], loading: false };
  return { vehicles: state?.key === key ? state.vehicles : [], loading: state?.key !== key };
}

type Shared = { locale: AppLocale; currency: string; vehicleBase: string; api?: string };

export function RecentlyViewed({
  title,
  exclude,
  ...shared
}: Shared & { title: string; exclude?: string }) {
  const { vehicles } = useDeviceVehicles("recent", shared.api ?? "/api/storefront", exclude);
  if (vehicles.length === 0) return null;
  return (
    <section className="grid gap-5">
      <h2 className="font-heading text-2xl font-semibold">{title}</h2>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {vehicles.slice(0, 8).map((vehicle) => (
          <VehicleCard
            key={vehicle.stockNumber}
            vehicle={vehicle}
            locale={shared.locale}
            currency={shared.currency}
            href={`${shared.vehicleBase}/${encodeURIComponent(vehicle.stockNumber)}`}
            className="w-64 shrink-0 snap-start"
          />
        ))}
      </div>
    </section>
  );
}

export function SavedVehicles({ browseHref, ...shared }: Shared & { browseHref: string }) {
  const t = useTranslations("storefront");
  const saved = useDeviceList("saved");
  const { vehicles, loading } = useDeviceVehicles("saved", shared.api ?? "/api/storefront");

  if (saved.length === 0) {
    return (
      <div className="bg-card ring-border grid justify-items-center gap-3 rounded-lg px-6 py-16 text-center ring-1">
        <span className="bg-muted flex size-14 items-center justify-center rounded-full">
          <HeartIcon className="text-muted-foreground size-6" aria-hidden />
        </span>
        <h2 className="font-heading text-lg font-semibold">{t("saved.none")}</h2>
        <p className="text-muted-foreground max-w-sm text-sm">{t("saved.noneHint")}</p>
        <Link
          href={browseHref}
          className="mt-2 inline-flex h-10 items-center rounded-lg px-5 text-sm font-semibold"
          style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
        >
          {t("nav.browseAll")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t("saved.deviceNote")}</p>
        <button
          type="button"
          onClick={() => clearList("saved")}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <Trash2Icon className="size-4" aria-hidden />
          {t("saved.clear")}
        </button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={loading}>
        {loading
          ? saved
              .slice(0, 4)
              .map((stock) => (
                <div key={stock} className="bg-muted aspect-[4/5] animate-pulse rounded-lg" />
              ))
          : vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.stockNumber}
                vehicle={vehicle}
                locale={shared.locale}
                currency={shared.currency}
                href={`${shared.vehicleBase}/${encodeURIComponent(vehicle.stockNumber)}`}
              />
            ))}
      </div>
    </div>
  );
}
