"use client";

import {
  animate,
  motion,
  MotionConfig,
  useInView,
  useMotionValue,
  useScroll,
  useTransform,
  type HTMLMotionProps,
  type MotionValue,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

import type en from "../../../messages/en.json";

export type LandingCopy = (typeof en)["landing"];

/** The app's "out-expo" curve, so landing motion feels like the rest of AutoNexa. */
export const ease = [0.16, 1, 0.3, 1] as const;

/** Honour the visitor's reduced-motion setting everywhere on the page. */
export function LandingMotionConfig({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.7, ease }}>
      {children}
    </MotionConfig>
  );
}

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

/** Fades and lifts its content in once, as it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  ...props
}: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={revealVariants}
      transition={{ delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** A parent whose StaggerItem children reveal one after another. */
export function Stagger({
  children,
  className,
  step = 0.08,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  as?: "div" | "ul" | "ol";
}) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: step } } }}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  ...props
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
} & HTMLMotionProps<"div">) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component className={className} variants={revealVariants} {...props}>
      {children}
    </Component>
  );
}

/** Counts up to a number the first time it's on screen. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const count = useMotionValue(0);
  const text = useTransform(count, (latest) =>
    new Intl.NumberFormat("en-US").format(Math.round(latest)),
  );

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, { duration: 1.4, ease });
    return () => controls.stop();
  }, [count, inView, value]);

  return (
    <motion.span ref={ref} className={className} dir="ltr">
      {text}
    </motion.span>
  );
}

function ScrollWord({
  children,
  progress,
  range,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <motion.span style={{ opacity }} className="inline">
      {children}
    </motion.span>
  );
}

/** A statement that lights up word by word as it's scrolled through. */
export function ScrollWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((item, index) => (
        <ScrollWord
          key={`${item}-${index}`}
          progress={scrollYProgress}
          range={[index / words.length, (index + 1) / words.length]}
        >
          {index < words.length - 1 ? `${item} ` : item}
        </ScrollWord>
      ))}
    </p>
  );
}

/** Small uppercase label above a section title, in the brand's gold. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`text-brand-strong dark:text-brand inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase ${className}`}
    >
      <span className="bg-gold h-px w-6" aria-hidden />
      {children}
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  intro,
  center = false,
  className = "",
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <Reveal className={`${center ? "mx-auto text-center" : ""} max-w-2xl ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {intro ? (
        <p className="text-muted-foreground mt-4 text-base text-pretty sm:text-lg">{intro}</p>
      ) : null}
    </Reveal>
  );
}
