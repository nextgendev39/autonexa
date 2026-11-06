"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon,
  CarFrontIcon,
  ChevronDownIcon,
  HeartIcon,
  LanguagesIcon,
  MenuIcon,
  MessageCircleIcon,
  PhoneIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useDeviceList } from "@/components/storefront/device-lists";
import { telLink, whatsappLink } from "@/components/storefront/labels";
import { SearchBox } from "@/components/storefront/search-box";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

export type SiteLinks = {
  home: string;
  vehicles: string;
  used: string;
  new: string;
  saved: string;
  contact: string;
  switchLanguage: string;
};

/** What the Cars menu offers, worked out on the server from what's actually listed. */
export type MenuData = {
  total: number;
  used: number;
  new: number;
  bodies: { label: string; count: number; href: string }[];
  brands: { label: string; count: number; href: string; logo: string | null }[];
};

type Props = {
  name: string;
  logo: string | null;
  links: SiteLinks;
  phone: string | null;
  whatsapp: string | null;
  menu: MenuData | null;
  /** Where the search box asks for suggestions. */
  api: string;
};

/** Which menu item the current address belongs to. Used and new are their own pages. */
function useSection(links: SiteLinks) {
  const pathname = usePathname();
  const params = useSearchParams();
  const path = (href: string) => href.split("?")[0];
  if (pathname === path(links.saved)) return "saved";
  if (pathname === path(links.contact)) return "contact";
  if (pathname.startsWith(path(links.vehicles))) {
    const condition = params.get("condition");
    return condition === "used" ? "used" : condition === "new" ? "new" : "cars";
  }
  return pathname === path(links.home) ? "home" : null;
}

function CarsMenu({
  menu,
  links,
  onNavigate,
}: {
  menu: MenuData;
  links: SiteLinks;
  onNavigate: () => void;
}) {
  const t = useTranslations("storefront");
  const shop = [
    { href: links.vehicles, label: t("nav.allCars"), count: menu.total, icon: CarFrontIcon },
    { href: links.used, label: t("nav.used"), count: menu.used, icon: CarFrontIcon },
    { href: links.new, label: t("nav.new"), count: menu.new, icon: SparklesIcon },
  ];
  return (
    <div className="grid gap-8 p-6 md:grid-cols-[1fr_1fr_1.4fr]">
      <div className="grid content-start gap-1">
        <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.14em] uppercase">
          {t("nav.shop")}
        </p>
        {shop.map(({ href, label, count, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className="hover:bg-muted group flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium"
          >
            <span
              className="flex size-8 items-center justify-center rounded-md"
              style={{ background: "color-mix(in oklch, var(--sf-accent) 18%, transparent)" }}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="flex-1">{label}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
          </Link>
        ))}
      </div>
      {menu.bodies.length ? (
        <div className="grid content-start gap-1">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.14em] uppercase">
            {t("nav.byBody")}
          </p>
          {menu.bodies.map((body) => (
            <Link
              key={body.href}
              href={body.href}
              onClick={onNavigate}
              className="hover:bg-muted flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm"
            >
              {body.label}
              <span className="text-muted-foreground text-xs tabular-nums">{body.count}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {menu.brands.length ? (
        <div className="grid content-start gap-2">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-[0.14em] uppercase">
            {t("nav.byBrand")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {menu.brands.map((brand) => (
              <Link
                key={brand.href}
                href={brand.href}
                onClick={onNavigate}
                className="ring-border hover:bg-muted flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ring-1"
              >
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small static logo
                  <img src={brand.logo} alt="" className="h-5 w-7 object-contain" />
                ) : (
                  <span className="bg-muted flex h-5 w-7 items-center justify-center rounded text-[10px] font-bold">
                    {brand.label.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{brand.label}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{brand.count}</span>
              </Link>
            ))}
          </div>
          <Link
            href={links.vehicles}
            onClick={onNavigate}
            className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-semibold hover:underline"
          >
            {t("home.viewAll")}
            <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader({ name, logo, links, phone, whatsapp, menu, api }: Props) {
  const t = useTranslations("storefront");
  const saved = useDeviceList("saved").length;
  const pathname = usePathname();
  const section = useSection(links);
  // Remember where each panel was opened, so moving to another page closes it.
  const [openAt, setOpenAt] = useState<{
    panel: "cars" | "search" | "mobile";
    path: string;
  } | null>(null);
  const open = openAt?.path === pathname ? openAt.panel : null;
  const toggle = (panel: "cars" | "search" | "mobile") =>
    setOpenAt(open === panel ? null : { panel, path: pathname });
  const close = () => setOpenAt(null);
  const [scrolled, setScrolled] = useState(false);
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenAt(null);
    const onClick = (event: MouseEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const item = (active: boolean) =>
    cn(
      "relative inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors",
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
    );
  const underline = (active: boolean) =>
    active ? (
      <motion.span
        layoutId="site-nav-underline"
        className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full"
        style={{ background: "var(--sf-accent)" }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
      />
    ) : null;

  const navLinks = [
    { key: "home", href: links.home, label: t("nav.home") },
    { key: "used", href: links.used, label: t("nav.used") },
    { key: "new", href: links.new, label: t("nav.new") },
    { key: "contact", href: links.contact, label: t("nav.contact") },
  ] as const;

  return (
    <header
      ref={header}
      className={cn(
        "bg-background/90 sticky top-0 z-40 border-b backdrop-blur-xl transition-shadow",
        scrolled || open ? "border-border shadow-sm" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href={links.home}
          className="flex min-w-0 items-center gap-2.5 font-semibold"
          onClick={close}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the dealership's own public image
            <img src={logo} alt="" className="h-9 w-auto max-w-36 object-contain" />
          ) : (
            <span
              className="font-heading flex size-9 shrink-0 items-center justify-center rounded-lg text-base"
              style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              aria-hidden
            >
              {name.charAt(0)}
            </span>
          )}
          <span className="font-heading truncate text-base sm:text-lg">{name}</span>
        </Link>

        <nav aria-label={t("nav.label")} className="ms-4 hidden lg:block">
          <ul className="flex items-center gap-0.5">
            <li>
              <Link
                href={links.home}
                aria-current={section === "home" ? "page" : undefined}
                className={item(section === "home")}
              >
                {t("nav.home")}
                {underline(section === "home")}
              </Link>
            </li>
            <li>
              {menu ? (
                <button
                  type="button"
                  aria-expanded={open === "cars"}
                  aria-controls="site-cars-menu"
                  onClick={() => toggle("cars")}
                  className={item(section === "cars" || open === "cars")}
                >
                  {t("nav.vehicles")}
                  <ChevronDownIcon
                    className={cn("size-4 transition-transform", open === "cars" && "rotate-180")}
                    aria-hidden
                  />
                  {underline(section === "cars")}
                </button>
              ) : (
                <Link href={links.vehicles} className={item(section === "cars")}>
                  {t("nav.vehicles")}
                  {underline(section === "cars")}
                </Link>
              )}
            </li>
            {navLinks.slice(1).map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  aria-current={section === link.key ? "page" : undefined}
                  className={item(section === link.key)}
                >
                  {link.label}
                  {underline(section === link.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggle("search")}
            aria-expanded={open === "search"}
            aria-label={t("nav.search")}
            className="hover:bg-muted inline-flex size-9 items-center justify-center rounded-md"
          >
            <SearchIcon className="size-4.5" aria-hidden />
          </button>
          <Link
            href={links.switchLanguage}
            className="hover:bg-muted hidden h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium sm:inline-flex"
          >
            <LanguagesIcon className="size-4" aria-hidden />
            {t("nav.switchLanguage")}
          </Link>
          <Link
            href={links.saved}
            aria-current={section === "saved" ? "page" : undefined}
            className={cn(
              "hover:bg-muted relative inline-flex size-9 items-center justify-center rounded-md",
              section === "saved" && "bg-muted",
            )}
            aria-label={`${t("nav.saved")}${saved ? ` (${saved})` : ""}`}
          >
            <HeartIcon
              className={cn("size-4.5", section === "saved" && "fill-current")}
              aria-hidden
            />
            {saved ? (
              <span
                className="absolute -end-0.5 -top-0.5 flex min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: "var(--sf-accent)", color: "var(--sf-on-accent)" }}
              >
                {saved}
              </span>
            ) : null}
          </Link>
          {phone ? (
            <a
              href={telLink(phone)}
              className="hidden h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold ring-1 ring-black/5 ring-inset md:inline-flex dark:ring-white/25"
              style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
            >
              <PhoneIcon className="size-4" aria-hidden />
              <span dir="ltr">{phone}</span>
            </a>
          ) : null}
          <button
            type="button"
            className="hover:bg-muted inline-flex size-9 items-center justify-center rounded-md lg:hidden"
            aria-expanded={open === "mobile"}
            aria-controls="site-menu"
            aria-label={open === "mobile" ? t("nav.close") : t("nav.menu")}
            onClick={() => toggle("mobile")}
          >
            {open === "mobile" ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open === "cars" && menu ? (
          <motion.div
            id="site-cars-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease }}
            className="border-border bg-background absolute inset-x-0 top-full hidden border-b shadow-lg lg:block"
          >
            <div className="mx-auto max-w-7xl px-2 sm:px-4">
              <CarsMenu menu={menu} links={links} onNavigate={close} />
            </div>
          </motion.div>
        ) : null}

        {open === "search" ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease }}
            className="border-border bg-background absolute inset-x-0 top-full border-b shadow-lg"
          >
            <div className="mx-auto max-w-3xl px-4 py-5">
              <SearchBox
                action={links.vehicles}
                vehicleBase={links.vehicles}
                api={api}
                size="large"
                autoFocus
              />
            </div>
          </motion.div>
        ) : null}

        {open === "mobile" ? (
          <motion.nav
            id="site-menu"
            aria-label={t("nav.label")}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease }}
            className="border-border bg-background absolute inset-x-0 top-full max-h-[calc(100svh-4rem)] overflow-y-auto border-b shadow-lg lg:hidden"
          >
            <div className="mx-auto grid max-w-7xl gap-5 px-4 py-4">
              <SearchBox action={links.vehicles} vehicleBase={links.vehicles} api={api} />
              <ul className="grid gap-1">
                {[
                  navLinks[0],
                  { key: "cars", href: links.vehicles, label: t("nav.allCars") },
                  ...navLinks.slice(1),
                ].map((link) => (
                  <li key={link.key}>
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={section === link.key ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-3 text-base font-medium",
                        section === link.key ? "bg-muted" : "hover:bg-muted",
                      )}
                    >
                      {link.label}
                      {link.key === "cars" && menu ? (
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {menu.total}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={links.saved}
                    onClick={close}
                    className="hover:bg-muted flex items-center justify-between rounded-md px-3 py-3 text-base font-medium"
                  >
                    {t("nav.saved")}
                    {saved ? <span className="text-muted-foreground text-sm">{saved}</span> : null}
                  </Link>
                </li>
              </ul>
              {menu?.bodies.length ? (
                <div className="grid gap-2">
                  <p className="text-muted-foreground px-1 text-xs font-semibold tracking-[0.14em] uppercase">
                    {t("nav.byBody")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {menu.bodies.map((body) => (
                      <Link
                        key={body.href}
                        href={body.href}
                        onClick={close}
                        className="border-border hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm"
                      >
                        {body.label}
                        <span className="text-muted-foreground text-xs">{body.count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="border-border grid gap-2 border-t pt-4 sm:grid-cols-3">
                {phone ? (
                  <a
                    href={telLink(phone)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ring-1 ring-black/5 ring-inset dark:ring-white/25"
                    style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
                  >
                    <PhoneIcon className="size-4" aria-hidden />
                    {t("vehicle.call")}
                  </a>
                ) : null}
                {whatsapp ? (
                  <a
                    href={whatsappLink(whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1f9d55] text-sm font-semibold text-white"
                  >
                    <MessageCircleIcon className="size-4" aria-hidden />
                    {t("vehicle.whatsapp")}
                  </a>
                ) : null}
                <Link
                  href={links.switchLanguage}
                  className="border-border hover:bg-muted inline-flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium"
                >
                  <LanguagesIcon className="size-4" aria-hidden />
                  {t("nav.switchLanguage")}
                </Link>
              </div>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
