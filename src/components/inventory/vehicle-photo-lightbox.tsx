"use client";

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type LightboxPhoto = {
  id: string;
  src: string | null;
  alt: string;
  caption?: string | null;
};

export function VehiclePhotoLightbox({
  photos,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: {
  photos: LightboxPhoto[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}) {
  const t = useTranslations();
  const touchStartX = useRef<number | null>(null);
  const [safeIndex, setSafeIndex] = useState(index);

  // Follow the requested photo whenever the lightbox opens or the index changes.
  const [synced, setSynced] = useState({ index, open });
  if (synced.index !== index || synced.open !== open) {
    setSynced({ index, open });
    if (open) setSafeIndex(index);
  }

  const total = photos.length;
  const current = photos[safeIndex] ?? null;

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return;
      const next = (safeIndex + delta + total) % total;
      setSafeIndex(next);
      onIndexChange(next);
    },
    [onIndexChange, safeIndex, total],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, open]);

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "bg-black text-white fixed inset-0 top-0 start-0 z-50 flex h-dvh max-h-dvh w-screen max-w-none",
          "translate-x-0 translate-y-0 rounded-none border-0 p-0 shadow-none ring-0",
          "data-open:zoom-in-100 data-closed:zoom-out-100 sm:max-w-none",
        )}
        aria-describedby={undefined}
      >
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 py-3 sm:px-5">
          <DialogTitle className="truncate text-sm font-medium text-white">
            {current.caption || current.alt}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums text-xs text-white/80">
              {t("inventory.photos.lightbox.counter", {
                current: safeIndex + 1,
                total,
              })}
            </span>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="bg-white/15 text-white hover:bg-white/25"
              aria-label={t("common.close")}
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="size-5" aria-hidden />
            </Button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-16 sm:px-16"
          onTouchStart={(event) => {
            touchStartX.current = event.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (start == null || end == null) return;
            const delta = end - start;
            if (Math.abs(delta) < 40) return;
            go(delta > 0 ? -1 : 1);
          }}
        >
          {total > 1 ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute start-3 top-1/2 z-10 -translate-y-1/2 bg-white/15 text-white hover:bg-white/25 sm:start-5"
                aria-label={t("inventory.photos.lightbox.previous")}
                onClick={() => go(-1)}
              >
                <ChevronLeftIcon className="size-6 rtl:rotate-180" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute end-3 top-1/2 z-10 -translate-y-1/2 bg-white/15 text-white hover:bg-white/25 sm:end-5"
                aria-label={t("inventory.photos.lightbox.next")}
                onClick={() => go(1)}
              >
                <ChevronRightIcon className="size-6 rtl:rotate-180" aria-hidden />
              </Button>
            </>
          ) : null}

          {current.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="text-sm text-white/80">{t("inventory.photos.lightbox.unavailable")}</p>
          )}
        </div>

        {total > 1 ? (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 to-transparent px-3 pb-4 pt-10 sm:px-5">
            <ul className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1">
              {photos.map((photo, photoIndex) => (
                <li key={photo.id} className="shrink-0">
                  <button
                    type="button"
                    className={cn(
                      "relative block size-14 overflow-hidden rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:size-16",
                      photoIndex === safeIndex
                        ? "border-white ring-2 ring-white/50"
                        : "border-white/20 opacity-70 hover:opacity-100",
                    )}
                    aria-label={t("inventory.photos.lightbox.goTo", {
                      current: photoIndex + 1,
                    })}
                    aria-current={photoIndex === safeIndex}
                    onClick={() => {
                      setSafeIndex(photoIndex);
                      onIndexChange(photoIndex);
                    }}
                  >
                    {photo.src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs
                      <img
                        src={photo.src}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="block size-full bg-white/10" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
