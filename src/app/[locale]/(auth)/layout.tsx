import { CheckIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/navigation/language-switcher";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { BrandMark } from "@/components/shared/brand-mark";
import { Link } from "@/lib/i18n/navigation";

/**
 * AutoNexa sign-in stage: a full-bleed obsidian backdrop in both themes, the AutoNexa car mark
 * as a faint watermark, and the form on a centered card (it follows the theme) with a
 * champagne top edge. Below the card: the tagline and three short facts. Shared by sign in,
 * password reset, email verification, invitations and first-run setup.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const facts = t.raw("landing.opening.facts") as string[];

  return (
    <div className="brand-dark-scope relative isolate flex h-svh flex-col overflow-y-auto bg-[#080a0f] text-[#f3f3f0]">
      {/* Backdrop: a soft champagne light from above, a fading engineering grid, the car mark. */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,rgb(197_169_107/0.16),transparent_70%),linear-gradient(180deg,#080a0f_0%,#111318_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 [background-image:linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)] [background-size:56px_56px]"
        aria-hidden
      />
      <Image
        src="/brand/mark-dark.png"
        alt=""
        width={421}
        height={256}
        priority
        aria-hidden
        className="pointer-events-none fixed top-1/2 left-1/2 -z-10 w-[min(68rem,150vw)] max-w-none -translate-x-1/2 -translate-y-[56%] opacity-[0.035] select-none"
      />

      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <BrandMark tone="dark" className="[&_img]:h-8" />
        <div className="flex items-center gap-1 [&_button]:text-white/75 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pt-2 pb-10 sm:px-6">
        <div className="animate-page-in w-full max-w-[27rem]">
          <p className="eyebrow text-sidebar-primary mb-4 text-center">{t("app.region")}</p>

          {/* The form card, with the champagne top edge shared with floating panels. */}
          <div className="bg-card text-card-foreground relative grid gap-8 overflow-hidden rounded-2xl border border-white/10 p-6 shadow-[0_32px_80px_-24px_rgb(0_0_0/0.75)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[linear-gradient(90deg,transparent,#c5a96b_25%,#e8d5a9_50%,#c5a96b_75%,transparent)] sm:p-8 dark:border-white/8">
            {children}
          </div>

          <div className="mt-8 grid justify-items-center gap-4 text-center">
            <p className="font-heading max-w-xs text-lg leading-snug font-semibold tracking-[-0.015em] text-balance text-white">
              {t("app.tagline")}
            </p>
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/60">
              {facts.map((fact) => (
                <li key={fact} className="flex items-center gap-1.5">
                  <span className="flex size-4 items-center justify-center rounded-full bg-[#c5a96b]/15 text-[#e8d5a9]">
                    <CheckIcon className="size-2.5" aria-hidden />
                  </span>
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 px-4 py-5 text-center text-[11px] text-white/40 sm:px-8">
        © {new Date().getFullYear()}{" "}
        <Link
          href="/"
          className="underline-offset-4 transition-colors hover:text-white/70 hover:underline"
        >
          {t("app.name")}
        </Link>
        <span className="mx-2 text-white/20" aria-hidden>
          ·
        </span>
        {t("app.footnote")}
      </footer>
    </div>
  );
}
