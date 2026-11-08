"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  BoxesIcon,
  CalendarCheckIcon,
  ChevronDownIcon,
  ReceiptIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { ease, type LandingCopy } from "@/components/landing/motion";
import { ThemedImage } from "@/components/landing/themed-image";
import { cn } from "@/lib/utils";

const icons = [BoxesIcon, CalendarCheckIcon, ReceiptIcon, TagIcon, UsersIcon];
const DESKTOP = "(min-width: 1024px)";

/** Wide screens pin the tabs and let scrolling step through them; phones just tap. */
function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

/** How far the visitor has scrolled through one tab's share of the track, 0 to 1. */
function TabProgress({
  progress,
  index,
  count,
}: {
  progress: MotionValue<number>;
  index: number;
  count: number;
}) {
  const scaleX = useTransform(progress, [index / count, (index + 1) / count], [0, 1], {
    clamp: true,
  });
  return (
    <motion.span
      style={{ scaleX }}
      className="bg-gold absolute inset-x-0 bottom-0 h-0.5 origin-left rtl:origin-right"
      aria-hidden
    />
  );
}

/**
 * The three core jobs as tabs. On wide screens the block stays pinned while the visitor scrolls,
 * and each stretch of scrolling selects the next tab; clicking a tab scrolls to its stretch.
 */
export function FeatureTabs({ copy }: { copy: LandingCopy["features"] }) {
  const track = useRef<HTMLDivElement>(null);
  const desktop = useDesktop();
  const [active, setActive] = useState(0);
  const rows = copy.rows;
  const count = rows.length;
  const row = rows[active];

  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!desktop) return;
    const next = Math.min(count - 1, Math.max(0, Math.floor(value * count)));
    setActive((current) => (current === next ? current : next));
  });

  function select(index: number, tab: HTMLElement) {
    if (!desktop) {
      // Phones stack the tabs as an accordion, so opening one collapses the one above it and
      // would pull the tapped tab up out from under the finger. iOS Safari has no scroll
      // anchoring, and correcting the scroll frame by frame while the rows animate makes the
      // page shake there. So the old tab closes at once (no transition below desktop), and the
      // scroll is corrected in the same task, before the browser paints anything.
      const before = tab.getBoundingClientRect().top;
      flushSync(() => setActive(index));
      const drift = tab.getBoundingClientRect().top - before;
      if (Math.abs(drift) > 0.5) scrollBy({ top: drift, behavior: "instant" });
      return;
    }
    setActive(index);
    const element = track.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top + scrollY;
    const distance = element.offsetHeight - innerHeight;
    scrollTo({ top: top + ((index + 0.5) / count) * distance });
  }

  return (
    // The track's extra height is the scroll distance: a little over half a screen per tab.
    <div
      ref={track}
      className="relative mt-12 lg:mt-0 lg:h-[calc(var(--tabs)*60svh+100svh)]"
      style={{ "--tabs": count } as React.CSSProperties}
    >
      <div className="lg:sticky lg:top-0 lg:flex lg:h-svh lg:items-center lg:pt-16">
        <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div role="tablist" aria-orientation="vertical" className="grid content-start gap-3">
            {rows.map((item, index) => {
              const Icon = icons[index % icons.length];
              const selected = index === active;
              return (
                <button
                  key={item.name}
                  id={`feature-tab-${index}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="feature-panel"
                  onClick={(event) => select(index, event.currentTarget)}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border p-4 text-start transition-colors duration-300 sm:p-5",
                    selected
                      ? "border-brand/40 bg-card shadow-md"
                      : "hover:bg-card/60 max-lg:border-border max-lg:bg-card/50 border-transparent",
                  )}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
                        selected
                          ? "bg-gold text-brand-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="flex items-start justify-between gap-3 text-lg font-semibold">
                        {item.name}
                        <ChevronDownIcon
                          aria-hidden
                          className={cn(
                            "text-muted-foreground mt-1 size-5 shrink-0 transition-transform duration-300 lg:hidden",
                            selected && "rotate-180",
                          )}
                        />
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm text-pretty">{item.lead}</p>
                      {/*
                        A CSS grid-rows transition, not Framer's height: "auto". Framer measures auto
                        heights by calling scrollTo(), which cancels a smooth anchor scroll passing
                        through the pinned track.
                      */}
                      <div
                        aria-hidden={!selected}
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                          // Below desktop only opening animates; closing is instant so select() can
                          // correct the scroll in one go.
                          selected
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0 max-lg:transition-none",
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <p className="mt-3 text-sm text-pretty">{item.text}</p>
                          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-muted/60 rounded-md p-3">
                              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                {copy.usedBy}
                              </dt>
                              <dd className="mt-1 font-medium">{item.usedBy}</dd>
                            </div>
                            <div className="bg-muted/60 rounded-md p-3">
                              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                {copy.replaces}
                              </dt>
                              <dd className="mt-1 font-medium line-through decoration-[color-mix(in_oklch,var(--destructive)_60%,transparent)]">
                                {item.replaces}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Phones show the screenshot in the open tab, where the visitor just tapped. */}
                  <div
                    aria-hidden
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:hidden",
                      selected
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0 max-lg:transition-none",
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="border-border bg-sidebar mt-4 overflow-hidden rounded-md border p-1">
                        <ThemedImage
                          name={item.image}
                          alt=""
                          width={1600}
                          height={1200}
                          loading="lazy"
                          className="aspect-[4/3] w-full rounded-[3px] object-cover object-top"
                        />
                      </div>
                    </div>
                  </div>
                  {selected && desktop ? (
                    <TabProgress progress={scrollYProgress} index={index} count={count} />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            id="feature-panel"
            role="tabpanel"
            aria-labelledby={`feature-tab-${active}`}
            className="relative hidden lg:block"
          >
            <div
              className="bg-brand-soft absolute -inset-4 -z-10 rounded-lg blur-2xl"
              aria-hidden
            />
            <div className="border-border bg-sidebar relative aspect-[4/3] overflow-hidden rounded-lg border p-1.5 shadow-lg">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={row.image}
                  initial={{ opacity: 0, y: 24, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -24, scale: 0.97 }}
                  transition={{ duration: 0.55, ease }}
                  className="size-full"
                >
                  <ThemedImage
                    name={row.image}
                    alt={row.alt}
                    width={1600}
                    height={1200}
                    className="size-full rounded-[3px] object-cover object-top"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
