"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import { useRef } from "react";

import { ease, type LandingCopy } from "@/components/landing/motion";
import { ThemedImage } from "@/components/landing/themed-image";

/** Five steps on one line that draws itself as the visitor scrolls through them. */
export function StepsTimeline({ copy }: { copy: LandingCopy["how"] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 60%"] });
  const line = useSpring(scrollYProgress, { stiffness: 90, damping: 25 });

  return (
    // On wide screens each step is a subgrid over five shared rows (number, label, name, text,
    // screen), so the screens line up however long each step's text runs.
    <ol
      ref={ref}
      className="relative mt-14 grid gap-10 lg:mt-20 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-0"
    >
      {/* The track: vertical on phones, horizontal on wide screens. */}
      <span
        className="bg-border absolute start-5 top-0 bottom-0 w-px lg:start-0 lg:end-0 lg:top-5 lg:bottom-auto lg:h-px lg:w-auto"
        aria-hidden
      />
      <motion.span
        style={{ scaleY: line }}
        className="bg-gold absolute start-5 top-0 bottom-0 w-px origin-top lg:hidden"
        aria-hidden
      />
      <motion.span
        style={{ scaleX: line }}
        className="bg-gold absolute start-0 end-0 top-5 hidden h-px origin-left lg:block rtl:origin-right"
        aria-hidden
      />

      {copy.steps.map((step, index) => (
        <motion.li
          key={step.name}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.7, ease, delay: index * 0.1 }}
          className="relative ps-14 lg:row-span-5 lg:grid lg:grid-rows-subgrid lg:ps-0"
        >
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 + index * 0.1 }}
            className="bg-gold text-brand-foreground font-heading ring-background absolute start-0 top-0 flex size-10 items-center justify-center rounded-full text-sm font-bold ring-8 lg:relative"
          >
            {index + 1}
          </motion.span>
          <p className="text-muted-foreground mt-0 text-xs font-semibold tracking-[0.14em] uppercase lg:mt-6">
            {copy.stepLabel} {index + 1}
          </p>
          <h3 className="mt-1 text-xl font-semibold">{step.name}</h3>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">{step.text}</p>
          <motion.figure
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="border-border bg-sidebar mt-5 max-w-60 self-start overflow-hidden rounded-lg border p-1 shadow-sm lg:max-w-none"
          >
            <ThemedImage
              name={step.image}
              alt={step.alt}
              width={780}
              height={1170}
              loading="lazy"
              className="aspect-[2/3] w-full rounded-[3px] object-cover object-top"
            />
          </motion.figure>
        </motion.li>
      ))}
    </ol>
  );
}
