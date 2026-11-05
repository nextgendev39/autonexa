"use client";

import { useState } from "react";
import { CarFrontIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function VehicleGallery({ photos, title }: { photos: { id: string; url: string }[]; title: string }) {
  const t = useTranslations("storefront");
  const [index, setIndex] = useState(0);
  const current = photos[index];
  if (!current) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[4/3] items-center justify-center rounded-xl">
        <CarFrontIcon className="size-12" aria-hidden />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="bg-muted aspect-[4/3] overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img src={current.url} alt={title} className="size-full object-cover" />
      </div>
      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t("vehicle.photos")}>
          {photos.map((photo, position) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-label={t("vehicle.photoNumber", { number: position + 1 })}
                aria-current={position === index}
                className={cn("size-20 overflow-hidden rounded-md ring-2 ring-transparent", position === index && "ring-[var(--sf-accent)]")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={photo.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
