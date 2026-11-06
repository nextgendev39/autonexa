import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import type { AppLocale } from "@/config/app";
import { sitePath } from "@/lib/storefront/host";
import { requireSite, siteClient } from "@/lib/storefront/site";
import { getPublicVehicle } from "@/lib/storefront/vehicles";
import { formatCurrency, formatNumber } from "@/lib/utils/currency";
import { VehicleScreen } from "@/components/storefront/screens/vehicle";
import { getLiveView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ stock: string }> };

const stockFrom = async (params: Props["params"]) => decodeURIComponent((await params).stock);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await requireSite();
  const found = await getPublicVehicle(siteClient(site), await stockFrom(params));
  if (!found) return { title: { absolute: site.displayName }, robots: { index: false } };
  const locale = await getLocale();
  const { vehicle } = found;
  const path = `/vehicles/${encodeURIComponent(vehicle.stockNumber)}`;
  const cover = vehicle.photos[0]?.url;
  const price =
    vehicle.price !== null
      ? formatCurrency(vehicle.price, locale as AppLocale, site.currency)
      : null;
  const summary = [
    vehicle.title,
    price,
    vehicle.mileage !== null
      ? `${formatNumber(vehicle.mileage, locale as AppLocale)} ${vehicle.mileageUnit}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const description = vehicle.description
    ? `${summary}. ${vehicle.description.slice(0, 120)}`
    : summary;
  return {
    title: vehicle.title,
    description,
    alternates: {
      canonical: sitePath(locale, path, site.defaultLocale),
      languages: {
        en: sitePath("en", path, site.defaultLocale),
        ar: sitePath("ar", path, site.defaultLocale),
      },
    },
    openGraph: {
      title: vehicle.title,
      description,
      type: "website",
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: { card: cover ? "summary_large_image" : "summary", title: vehicle.title, description },
  };
}

export default async function Page({ params }: Props) {
  await requireSite();
  return <VehicleScreen view={await getLiveView()} stockNumber={await stockFrom(params)} />;
}
