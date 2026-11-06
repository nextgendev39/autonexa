"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CarFrontIcon, ChevronLeftIcon, ChevronRightIcon, ExpandIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type Photo = { id: string; url: string };

/** Main photo with thumbnails, and a full-screen lightbox with keys, swipe and a counter. */
export function VehicleGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const t = useTranslations("storefront");
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [open, setOpen] = useState(false);
  const total = photos.length;

  const go = useCallback(
    (step: number) => {
      if (total < 2) return;
      setDirection(step);
      setIndex((current) => (current + step + total) % total);
    },
    [total],
  );

  useEffect(() => {
    if (!open) return;
    const rtl = document.documentElement.dir === "rtl";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") go(rtl ? -1 : 1);
      if (event.key === "ArrowLeft") go(rtl ? 1 : -1);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [go, open]);

  const current = photos[index];
  if (!current) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[16/10] items-center justify-center rounded-lg">
        <CarFrontIcon className="size-14" aria-hidden />
      </div>
    );
  }

  const slide = {
    enter: (d: number) => ({ x: d > 0 ? 60 : d < 0 ? -60 : 0, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -60 : d < 0 ? 60 : 0, opacity: 0 }),
  };

  const arrows = (large: boolean) =>
    total > 1 ? (
      <>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t("vehicle.previousPhoto")}
          className={cn(
            "absolute start-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75",
            large ? "size-12" : "size-10",
          )}
        >
          <ChevronLeftIcon className="size-5 rtl:rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t("vehicle.nextPhoto")}
          className={cn(
            "absolute end-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75",
            large ? "size-12" : "size-10",
          )}
        >
          <ChevronRightIcon className="size-5 rtl:rotate-180" />
        </button>
      </>
    ) : null;

  return (
    <div className="grid gap-3">
      <div className="bg-muted group relative aspect-[16/10] overflow-hidden rounded-lg">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.button
            key={current.id}
            type="button"
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setOpen(true)}
            aria-label={t("vehicle.openGallery", { number: index + 1, total })}
            className="absolute inset-0 cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img
              src={current.url}
              alt={`${title} (${index + 1}/${total})`}
              className="size-full object-cover"
            />
          </motion.button>
        </AnimatePresence>
        {arrows(false)}
        <span className="pointer-events-none absolute end-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          <ExpandIcon className="size-3.5" aria-hidden />
          {index + 1} / {total}
        </span>
      </div>

      {total > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t("vehicle.photos")}>
          {photos.map((photo, position) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDirection(position > index ? 1 : -1);
                  setIndex(position);
                }}
                aria-label={t("vehicle.photoNumber", { number: position + 1 })}
                aria-current={position === index}
                className={cn(
                  "h-16 w-24 overflow-hidden rounded-md opacity-70 ring-2 ring-transparent transition hover:opacity-100 sm:h-18 sm:w-28",
                  position === index && "opacity-100 ring-[var(--sf-accent)]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={photo.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label={title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
                >
                  <div className="flex items-center justify-between gap-4 p-4">
                    <p className="truncate text-sm font-medium">
                      {title} · {index + 1} / {total}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label={t("vehicle.closeGallery")}
                      autoFocus
                      className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                    >
                      <XIcon className="size-5" />
                    </button>
                  </div>
                  <div className="relative flex-1 overflow-hidden">
                    <AnimatePresence initial={false} custom={direction} mode="popLayout">
                      <motion.img
                        key={current.id}
                        src={current.url}
                        alt={`${title} (${index + 1}/${total})`}
                        custom={direction}
                        variants={slide}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        drag={total > 1 ? "x" : false}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.6}
                        onDragEnd={(_, info) => {
                          const rtl = document.documentElement.dir === "rtl";
                          if (Math.abs(info.offset.x) < 60) return;
                          const forward = info.offset.x < 0;
                          go(forward !== rtl ? 1 : -1);
                        }}
                        className="absolute inset-0 m-auto max-h-full max-w-full touch-pan-y object-contain select-none"
                        draggable={false}
                      />
                    </AnimatePresence>
                    {arrows(true)}
                  </div>
                  {total > 1 ? (
                    <ul className="flex justify-center gap-2 overflow-x-auto p-4">
                      {photos.map((photo, position) => (
                        <li key={photo.id} className="shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setDirection(position > index ? 1 : -1);
                              setIndex(position);
                            }}
                            aria-label={t("vehicle.photoNumber", { number: position + 1 })}
                            aria-current={position === index}
                            className={cn(
                              "h-12 w-18 overflow-hidden rounded opacity-50 transition hover:opacity-100",
                              position === index && "opacity-100 ring-2 ring-white",
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                            <img
                              src={photo.url}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
