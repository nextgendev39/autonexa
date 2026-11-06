"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRightIcon, CheckIcon, PlayCircleIcon } from "lucide-react";
import { useRef } from "react";

import { ease, type LandingCopy } from "@/components/landing/motion";
import { ThemedPicture } from "@/components/landing/themed-image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const word = {
  hidden: { opacity: 0, y: "0.5em", filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease } },
};

export function Hero({ copy }: { copy: LandingCopy["opening"] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  // The screen lies back and lifts flat as the visitor starts to scroll.
  const rotateX = useTransform(progress, [0, 0.35], [22, 0]);
  const scale = useTransform(progress, [0, 0.35], [0.92, 1]);
  const glowY = useTransform(progress, [0, 1], ["0%", "40%"]);
  const textY = useTransform(progress, [0, 0.5], [0, -60]);
  const textOpacity = useTransform(progress, [0, 0.4], [1, 0]);

  const words = copy.title.split(" ");
  const highlightFrom = Math.max(0, words.length - 2);

  return (
    <section
      ref={ref}
      id="top"
      className="bg-carbon text-sidebar-foreground relative isolate overflow-hidden pt-32 pb-20 sm:pt-40"
    >
      {/* Showroom lighting: gold and chrome glows over the carbon weave. */}
      <motion.div
        style={{ y: glowY }}
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
      >
        <div className="bg-sidebar-primary/25 animate-drift absolute start-1/2 top-24 size-[44rem] -translate-x-1/2 rounded-full blur-[140px] rtl:translate-x-1/2" />
        <div className="bg-chrome/15 animate-drift absolute -end-32 top-1/3 size-96 rounded-full blur-[120px] [animation-delay:-7s]" />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        {[14, 30, 48, 63, 78].map((top, index) => (
          <span
            key={top}
            className="via-sidebar-primary/50 animate-speed absolute h-px w-1/3 bg-linear-to-r from-transparent to-transparent"
            style={{
              top: `${top}%`,
              animationDelay: `${index * 0.55}s`,
              animationDuration: `${2.4 + (index % 3) * 0.7}s`,
              opacity: 0.25 + (index % 2) * 0.25,
            }}
          />
        ))}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 [transform-origin:bottom] [transform:perspective(600px)_rotateX(60deg)] [background-image:linear-gradient(var(--sidebar-primary)_1px,transparent_1px),linear-gradient(90deg,var(--sidebar-primary)_1px,transparent_1px)] [mask-image:linear-gradient(to_top,black,transparent)] [background-size:64px_64px] opacity-[0.07]"
        aria-hidden
      />

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="mx-auto max-w-4xl px-4 text-center sm:px-6"
      >
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease, delay: 0.1 }}
          className="border-sidebar-primary/30 bg-sidebar-primary/10 text-sidebar-primary inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-[0.12em] uppercase"
        >
          <span className="relative flex size-2">
            <span className="bg-sidebar-primary animate-ping-soft absolute inline-flex size-full rounded-full" />
            <span className="bg-sidebar-primary relative inline-flex size-2 rounded-full" />
          </span>
          {copy.caption}
        </motion.p>

        <motion.h1
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
          className="mt-7 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl"
        >
          {words.map((item, index) => (
            <motion.span
              key={`${item}-${index}`}
              variants={word}
              className={cn("inline-block pb-1", index >= highlightFrom && "text-gold")}
            >
              {item}
              {index < words.length - 1 ? " " : null}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.6 }}
          className="text-sidebar-foreground/70 mx-auto mt-6 max-w-2xl text-base text-pretty sm:text-lg"
        >
          {copy.lede}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.75 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="#demo"
            className={cn(
              buttonVariants({ variant: "brand", size: "lg" }),
              "sheen h-12 px-6 text-base",
            )}
          >
            {copy.primary}
            <ArrowRightIcon className="transition-transform group-hover/button:translate-x-0.5 rtl:rotate-180 rtl:group-hover/button:-translate-x-0.5" />
          </a>
          <a
            href="#how"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground border-sidebar-border h-12 border px-6 text-base",
            )}
          >
            <PlayCircleIcon />
            {copy.secondary}
          </a>
        </motion.div>

        <motion.ul
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.9 } } }}
          className="text-sidebar-foreground/70 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
        >
          {copy.facts.map((fact) => (
            <motion.li
              key={fact}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              className="inline-flex items-center gap-1.5"
            >
              <CheckIcon className="text-sidebar-primary size-4" />
              {fact}
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>

      {/* The product, presented in a browser frame that tilts flat on scroll. */}
      <div className="relative mx-auto mt-16 max-w-6xl px-4 [perspective:1400px] sm:mt-20 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease, delay: 0.5 }}
        >
          <motion.figure
            style={{ rotateX, scale, transformOrigin: "50% 0%" }}
            className="border-sidebar-border bg-sidebar relative rounded-lg border p-1.5 shadow-[0_40px_120px_-30px_color-mix(in_oklch,var(--sidebar-primary)_40%,transparent)] sm:p-2"
          >
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-[oklch(0.65_0.18_25)]" />
              <span className="size-2.5 rounded-full bg-[oklch(0.8_0.14_85)]" />
              <span className="size-2.5 rounded-full bg-[oklch(0.72_0.15_150)]" />
              <span className="bg-sidebar-accent mx-auto hidden h-4 w-72 rounded sm:block" />
            </div>
            <ThemedPicture
              name="dashboard"
              phoneName="dashboard-phone"
              phoneSize={{ width: 780, height: 1688 }}
              alt={copy.alt}
              width={1920}
              height={1200}
              fetchPriority="high"
              className="w-full rounded-[3px]"
            />
            <figcaption className="sr-only">{copy.note}</figcaption>
          </motion.figure>

          {/* Floating stat chips that echo what the dashboard shows. */}
          <div className="pointer-events-none absolute inset-x-0 -bottom-10 hidden justify-center gap-4 px-4 md:flex">
            {copy.chips.map((chip, index) => (
              <motion.div
                key={chip.label}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 1.1 + index * 0.12 }}
              >
                <div
                  className="animate-float border-border bg-card/95 text-card-foreground min-w-52 rounded-lg border p-4 shadow-lg backdrop-blur"
                  style={{ animationDelay: `${index * -2}s` }}
                >
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {chip.label}
                  </p>
                  <p className="font-heading mt-1 text-2xl font-semibold" dir="ltr">
                    {chip.value}
                  </p>
                  <p className="text-brand-strong dark:text-brand mt-0.5 text-xs">{chip.hint}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="mx-auto mt-24 max-w-3xl px-4 text-center"
      >
        <p className="font-heading text-sidebar-foreground/90 text-xl leading-snug text-balance sm:text-2xl">
          {copy.claim}
        </p>
        <p className="text-sidebar-foreground/45 mt-3 text-xs tracking-[0.14em] uppercase">
          {copy.place} · {copy.note}
        </p>
      </motion.div>
    </section>
  );
}
