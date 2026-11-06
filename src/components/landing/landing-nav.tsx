"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { MenuIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ease, type LandingCopy } from "@/components/landing/motion";
import { LanguageSwitcher } from "@/components/navigation/language-switcher";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { BrandMark } from "@/components/shared/brand-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

export function LandingNav({ copy }: { copy: LandingCopy["nav"] }) {
  const links = [
    { href: "#features", text: copy.features },
    { href: "#how", text: copy.how },
    { href: "#profit", text: copy.profit },
    { href: "#plans", text: copy.plans },
    { href: "#faq", text: copy.faq },
  ];
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 16));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease }}
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4"
    >
      <div
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center gap-4 rounded-lg border px-3 transition-all duration-300 sm:px-4",
          scrolled || open
            ? "border-border bg-background/80 shadow-md backdrop-blur-xl"
            : "text-sidebar-foreground border-transparent bg-transparent",
        )}
      >
        <a href="#top" aria-label={copy.home} dir="ltr">
          <BrandMark />
        </a>

        <nav aria-label={copy.main} className="ms-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    scrolled
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                  )}
                >
                  {link.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <LanguageSwitcher compact />
          <ThemeToggle />
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden sm:inline-flex",
            )}
          >
            {copy.signIn}
          </Link>
          <a
            href="#demo"
            className={cn(
              buttonVariants({ variant: "brand", size: "sm" }),
              "sheen hidden sm:inline-flex",
            )}
          >
            {copy.demo}
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? copy.close : copy.menu}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="landing-menu"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease }}
            className="border-border bg-background/95 mx-auto mt-2 max-w-6xl rounded-lg border p-3 shadow-lg backdrop-blur-xl lg:hidden"
          >
            <ul className="grid gap-1">
              {links.map((link, index) => (
                <motion.li
                  key={link.href}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * index }}
                >
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="hover:bg-muted block rounded-md px-3 py-2.5 text-base font-medium"
                  >
                    {link.text}
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="border-border mt-3 grid grid-cols-2 gap-2 border-t pt-3">
              <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
                {copy.signIn}
              </Link>
              <a
                href="#demo"
                onClick={() => setOpen(false)}
                className={buttonVariants({ variant: "brand", size: "lg" })}
              >
                {copy.demo}
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
