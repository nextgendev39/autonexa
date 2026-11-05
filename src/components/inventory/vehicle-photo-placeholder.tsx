import Image from "next/image";

import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils";

/**
 * Shown where a vehicle has no photo yet: a car outline in the brand's gold on carbon,
 * with the showroom mark. `sm` is the bare outline for thumbnails; larger sizes add the
 * logo, showroom name and an optional caption.
 */
export function VehiclePhotoPlaceholder({
  size = "md",
  label,
  className,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const small = size === "sm";
  return (
    <div
      className={cn(
        "bg-carbon relative flex size-full flex-col items-center justify-center overflow-hidden",
        small ? "gap-0" : "gap-2",
        className,
      )}
    >
      {/* Soft gold glow and floor line, like a car under showroom lights. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,color-mix(in_oklch,var(--brand)_18%,transparent),transparent_65%)]"
        aria-hidden
      />
      <div
        className="via-brand/30 pointer-events-none absolute inset-x-[12%] bottom-[22%] h-px bg-linear-to-r from-transparent to-transparent"
        aria-hidden
      />
      {small ? null : (
        <Image
          src="/brand/logo-mark.png"
          alt=""
          width={40}
          height={40}
          className={cn("relative opacity-80", size === "lg" ? "size-10" : "size-7")}
        />
      )}
      <CarOutline className={cn("text-brand/70 relative", small ? "w-4/5" : size === "lg" ? "w-1/2" : "w-3/5")} />
      {small ? null : (
        <div className="relative grid justify-items-center gap-0.5 text-center">
          <span className="font-heading text-sidebar-foreground/70 text-[0.7rem] font-semibold tracking-[0.2em] uppercase">
            {appConfig.name}
          </span>
          {label ? <span className="text-sidebar-foreground/45 text-xs">{label}</span> : null}
        </div>
      )}
    </div>
  );
}

/** Side profile of an SUV, drawn with strokes so it stays crisp at any size. */
function CarOutline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Body */}
      <path d="M8 34v-7c0-2 1-3.5 3-4l14-3.5 13-10c1.5-1.2 3.3-1.5 5-1.5h33c2 0 3.6.6 5 1.8l11 9.7 15 2.5c2.5.4 4 2.2 4 4.6V34c0 1.1-.9 2-2 2h-7" />
      <path d="M32.5 36h54" />
      <path d="M17 36h-7c-1.1 0-2-.9-2-2" />
      {/* Windows */}
      <path d="M41 19.5l8.5-7c.8-.6 1.7-1 2.7-1H62v8z" />
      <path d="M67 11.5h9.5c1.2 0 2.3.4 3.2 1.2l7.8 6.8H67z" />
      {/* Door line and lights */}
      <path d="M64.5 21v13" />
      <path d="M106 25h4" />
      <path d="M10 26h3" />
      {/* Wheels */}
      <circle cx="25" cy="36" r="7.5" />
      <circle cx="25" cy="36" r="2.5" />
      <circle cx="94" cy="36" r="7.5" />
      <circle cx="94" cy="36" r="2.5" />
    </svg>
  );
}
