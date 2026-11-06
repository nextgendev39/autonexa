"use client";

import { motion } from "framer-motion";
import { HeartIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { toggleSaved, useDeviceList } from "@/components/storefront/device-lists";
import { cn } from "@/lib/utils";

export function SaveButton({
  stockNumber,
  title,
  variant = "overlay",
  className,
}: {
  stockNumber: string;
  title: string;
  variant?: "overlay" | "button";
  className?: string;
}) {
  const t = useTranslations("storefront");
  const saved = useDeviceList("saved").includes(stockNumber);
  const label = `${saved ? t("vehicle.saved") : t("vehicle.save")}: ${title}`;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The card around it is a link.
        event.preventDefault();
        event.stopPropagation();
        toggleSaved(stockNumber);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors",
        variant === "overlay"
          ? "bg-background/90 hover:bg-background size-9 rounded-full shadow-sm backdrop-blur"
          : "border-border bg-card hover:bg-muted h-10 rounded-lg border px-3 text-sm font-medium",
        className,
      )}
    >
      <motion.span
        key={String(saved)}
        initial={{ scale: saved ? 0.6 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        className="inline-flex"
      >
        <HeartIcon
          className={cn("size-4.5", saved ? "fill-red-500 text-red-500" : "text-foreground")}
          aria-hidden
        />
      </motion.span>
      {variant === "button" ? <span>{saved ? t("vehicle.saved") : t("vehicle.save")}</span> : null}
    </button>
  );
}
