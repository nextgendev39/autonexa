"use client";

import { motion } from "framer-motion";
import { TriangleAlertIcon } from "lucide-react";

import { CountUp, ease, revealMargin, type LandingCopy } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/** Sample figures in AED. The flagged car sits below its minimum price. */
const sampleCars = [
  { name: "Lexus LX 570 2019", profit: 21600 },
  { name: "Toyota Land Cruiser 2021", profit: 18400 },
  { name: "Nissan Patrol 2020", profit: 15200 },
  { name: "BMW X5 2019", profit: 12700 },
  { name: "Mitsubishi Pajero 2018", profit: 7900 },
  { name: "Toyota Camry 2022", profit: 6100 },
  { name: "Hyundai Tucson 2021", profit: 5400 },
  { name: "Kia Sportage 2020", profit: 900, flagged: true },
];
const max = Math.max(...sampleCars.map((car) => car.profit));
const total = sampleCars.reduce((sum, car) => sum + car.profit, 0);

export function ProfitChart({ copy }: { copy: LandingCopy["profit"] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: revealMargin }}
      transition={{ duration: 0.8, ease }}
      className="border-border bg-card relative overflow-hidden rounded-lg border p-5 shadow-lg sm:p-7"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
            {copy.expected}
          </p>
          <p className="font-heading mt-1 text-3xl font-semibold sm:text-4xl">
            <span className="text-muted-foreground me-1.5 text-lg font-medium">{copy.aed}</span>
            <CountUp value={total} />
          </p>
        </div>
        <span className="bg-brand-soft text-brand-strong dark:text-brand rounded-full px-2.5 py-1 text-xs font-medium">
          {sampleCars.length} × {copy.car}
        </span>
      </div>

      <ol className="mt-6 grid gap-3.5">
        {sampleCars.map((car, index) => (
          <li key={car.name} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium" dir="ltr">
                {car.name}
              </span>
              <span
                className={cn(
                  "font-heading shrink-0 tabular-nums",
                  car.flagged && "text-destructive",
                )}
              >
                <CountUp value={car.profit} />
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: Math.max(car.profit / max, 0.03) }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, ease, delay: 0.15 + index * 0.07 }}
                className={cn(
                  "h-full origin-left rounded-full rtl:origin-right",
                  car.flagged ? "bg-destructive" : "bg-gold",
                )}
              />
            </div>
            {car.flagged ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1.2 }}
                className="bg-destructive/10 text-destructive mt-1 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
              >
                <TriangleAlertIcon className="size-3.5" />
                {copy.flag}
              </motion.p>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-6 text-xs">{copy.foot}</p>
    </motion.div>
  );
}
