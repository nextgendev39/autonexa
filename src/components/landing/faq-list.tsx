"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { ease, Stagger, StaggerItem, type LandingCopy } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

export function FaqList({ items }: { items: LandingCopy["faq"]["items"] }) {
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();

  return (
    <Stagger className="divide-border border-border bg-card divide-y rounded-lg border" step={0.06}>
      {items.map((item, index) => {
        const expanded = open === index;
        return (
          <StaggerItem key={item.q}>
            <h3>
              <button
                type="button"
                id={`${id}-q-${index}`}
                aria-expanded={expanded}
                aria-controls={`${id}-a-${index}`}
                onClick={() => setOpen(expanded ? null : index)}
                className="hover:bg-muted/50 flex w-full items-center justify-between gap-4 px-5 py-5 text-start text-base font-semibold transition-colors sm:px-6"
              >
                {item.q}
                <motion.span
                  animate={{ rotate: expanded ? 45 : 0 }}
                  transition={{ duration: 0.3, ease }}
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                    expanded ? "border-brand bg-gold text-brand-foreground" : "border-border",
                  )}
                >
                  <PlusIcon className="size-4" />
                </motion.span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  id={`${id}-a-${index}`}
                  role="region"
                  aria-labelledby={`${id}-q-${index}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease }}
                  className="overflow-hidden"
                >
                  <p className="text-muted-foreground px-5 pb-5 text-pretty sm:px-6">{item.a}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
