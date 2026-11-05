import Image from "next/image";

import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  showName = true,
}: {
  className?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Image
        src="/brand/logo-mark.png"
        alt=""
        width={32}
        height={32}
        priority
        className="size-8 shrink-0 rounded-lg drop-shadow-[0_2px_6px_color-mix(in_oklch,var(--brand)_35%,transparent)] transition-transform duration-500 ease-(--ease-spring) hover:scale-110 hover:-rotate-3"
      />
      {showName ? (
        <span className="font-heading truncate text-sm font-semibold tracking-tight">{appConfig.name}</span>
      ) : null}
    </span>
  );
}
