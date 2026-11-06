/* eslint-disable @next/next/no-img-element -- Pre-sized static WebP files; next/image adds nothing. */
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ImgProps = Omit<ComponentProps<"img">, "src" | "alt"> & { name: string; alt: string };

/**
 * A screenshot of the app in the visitor's theme. Light shots live in /landing, dark ones in
 * /landing/dark under the same name. The theme is a class on <html>, so both are rendered and
 * CSS shows one. The other is display: none, so screen readers skip it and, when lazy, the
 * browser never downloads it.
 */
export function ThemedImage({ name, alt, className, ...props }: ImgProps) {
  return (
    <>
      <img
        src={`/landing/${name}.webp`}
        alt={alt}
        className={cn(className, "dark:hidden")}
        {...props}
      />
      <img
        src={`/landing/dark/${name}.webp`}
        alt={alt}
        className={cn(className, "hidden dark:block")}
        {...props}
      />
    </>
  );
}

/** The hero's dashboard: a phone-shaped shot on small screens, the full app above. */
export function ThemedPicture({
  name,
  alt,
  phoneName,
  phoneSize,
  className,
  ...props
}: ImgProps & { phoneName: string; phoneSize: { width: number; height: number } }) {
  const variant = (dir: string, display: string) => (
    <picture className={display}>
      <source
        media="(max-width: 639.98px)"
        srcSet={`/landing/${dir}${phoneName}.webp`}
        {...phoneSize}
      />
      <img src={`/landing/${dir}${name}.webp`} alt={alt} className={className} {...props} />
    </picture>
  );
  return (
    <>
      {variant("", "contents dark:hidden")}
      {variant("dark/", "hidden dark:contents")}
    </>
  );
}
