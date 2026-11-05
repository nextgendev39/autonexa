import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/navigation/language-switcher";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { BrandMark } from "@/components/shared/brand-mark";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="grid h-svh overflow-y-auto lg:grid-cols-2">
      <section className="bg-carbon text-sidebar-foreground relative isolate hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        {/* Showroom backdrop: drifting gold/chrome spotlights over carbon weave. */}
        <div
          className="bg-sidebar-primary/25 animate-drift absolute -start-24 -bottom-40 -z-10 size-[34rem] rounded-full blur-[120px]"
          aria-hidden
        />
        <div
          className="bg-chrome/15 animate-drift absolute -end-24 -top-32 -z-10 size-96 rounded-full blur-[110px] [animation-delay:-7s]"
          aria-hidden
        />
        {/* Speed lines streaking across the panel. */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          {[18, 34, 52, 67, 81].map((top, index) => (
            <span
              key={top}
              className="via-sidebar-primary/50 animate-speed absolute h-px w-1/3 bg-linear-to-r from-transparent to-transparent"
              style={{
                top: `${top}%`,
                animationDelay: `${index * 0.55}s`,
                animationDuration: `${2.2 + (index % 3) * 0.6}s`,
                opacity: 0.35 + (index % 2) * 0.3,
              }}
            />
          ))}
        </div>
        {/* Road horizon: perspective grid fading into the distance. */}
        <div
          className="absolute inset-x-0 bottom-0 -z-10 h-1/2 [background-image:linear-gradient(var(--sidebar-primary)_1px,transparent_1px),linear-gradient(90deg,var(--sidebar-primary)_1px,transparent_1px)] [mask-image:linear-gradient(to_top,black,transparent)] [background-size:56px_56px] opacity-[0.08] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:bottom]"
          aria-hidden
        />
        <BrandMark className="text-sidebar-foreground animate-rise [&_span]:text-base" />
        <div className="stagger [--stagger:120ms]">
          <Image
            src="/brand/logo-mark.png"
            alt=""
            width={112}
            height={112}
            priority
            className="animate-float mb-8 size-28 rounded-lg drop-shadow-[0_18px_40px_color-mix(in_oklch,var(--sidebar-primary)_45%,transparent)]"
          />
          <p className="text-sidebar-primary border-sidebar-primary/30 bg-sidebar-primary/10 inline-flex rounded-full border px-3 py-1 text-xs font-medium tracking-[0.14em] uppercase">
            {t("app.region")}
          </p>
          <h2 className="text-gold mt-6 max-w-lg pb-1 text-5xl leading-[1.08] font-semibold tracking-tight text-balance">
            {t("app.tagline")}
          </h2>
          <p className="text-sidebar-foreground/65 mt-5 max-w-md text-base text-pretty">
            {t("app.footnote")}
          </p>
        </div>
        <p className="text-sidebar-foreground/40 text-xs">
          © {new Date().getFullYear()} {t("app.name")}
        </p>
      </section>
      <div className="flex min-h-full flex-col px-4 py-6 sm:px-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="ms-auto flex items-center gap-1">
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
        </div>
        <div className="animate-page-in mx-auto grid w-full max-w-sm flex-1 content-center gap-8 pb-12 [animation-delay:150ms]">
          {children}
        </div>
      </div>
    </div>
  );
}
