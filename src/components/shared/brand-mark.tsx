import Image from "next/image";

import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils";

/** Pixel sizes of the files in /public/brand, so next/image keeps their shape. */
const files = {
  logo: { dark: [720, 192], light: [695, 192] },
  mark: { dark: [421, 256], light: [413, 256] },
} as const;

/**
 * The AutoNexa logo. `showName` gives the full logo with the wordmark; without it, just the
 * symbol. `tone="dark"` is for surfaces that stay dark in both themes (the sidebar, the
 * sign-in panel); `auto` follows the theme, rendering both and letting CSS show one.
 */
export function BrandMark({
  className,
  showName = true,
  tone = "auto",
}: {
  className?: string;
  showName?: boolean;
  tone?: "auto" | "dark";
}) {
  const kind = showName ? "logo" : "mark";
  const alt = showName ? appConfig.name : "";
  const image = (variant: "dark" | "light", display?: string) => {
    const [width, height] = files[kind][variant];
    return (
      <Image
        key={variant}
        src={`/brand/${kind}-${variant}.png`}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          "w-auto shrink-0 transition-transform duration-500 ease-(--ease-spring) hover:scale-105",
          showName ? "h-9" : "h-7",
          display,
        )}
      />
    );
  };

  return (
    <span className={cn("inline-flex min-w-0 items-center", className)} dir="ltr">
      {tone === "dark"
        ? image("dark")
        : [image("light", "dark:hidden"), image("dark", "hidden dark:block")]}
    </span>
  );
}
