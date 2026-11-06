"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, MessageCircleIcon, PhoneIcon, Share2Icon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { rememberViewed } from "@/components/storefront/device-lists";
import { telLink, whatsappLink } from "@/components/storefront/labels";
import { SaveButton } from "@/components/storefront/save-button";
import { cn } from "@/lib/utils";

type Contact = { phone: string | null; whatsapp: string | null };

const noSubscribe = () => () => {};

function useWhatsappText(title: string, stockNumber: string) {
  const t = useTranslations("storefront");
  // The page's own address, read on the client: the server doesn't know which host it was asked on.
  const url = useSyncExternalStore(
    noSubscribe,
    () => window.location.href,
    () => "",
  );
  return t("vehicle.whatsappMessage", { title, stock: stockNumber, url });
}

export function ShareButton({ title, className }: { title: string; className?: string }) {
  const t = useTranslations("storefront");
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    // Phones get their share sheet; computers get the link copied, which is what people expect there.
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard blocked: nothing more to do. */
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "border-border bg-card hover:bg-muted inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium",
        className,
      )}
    >
      {copied ? (
        <CheckIcon className="size-4" aria-hidden />
      ) : (
        <Share2Icon className="size-4" aria-hidden />
      )}
      <span aria-live="polite">{copied ? t("vehicle.copied") : t("vehicle.share")}</span>
    </button>
  );
}

/** Call, WhatsApp and enquire, plus save and share. Remembers the car as recently viewed. */
export function VehicleActions({
  stockNumber,
  title,
  contact,
}: {
  stockNumber: string;
  title: string;
  contact: Contact;
}) {
  const t = useTranslations("storefront");
  const text = useWhatsappText(title, stockNumber);
  useEffect(() => rememberViewed(stockNumber), [stockNumber]);

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {contact.phone ? (
          <a
            href={telLink(contact.phone)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg text-sm font-semibold"
            style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
          >
            <PhoneIcon className="size-4" aria-hidden />
            {t("vehicle.call")}
          </a>
        ) : null}
        {contact.whatsapp ? (
          <a
            href={whatsappLink(contact.whatsapp, text)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#1f9d55] text-sm font-semibold text-white hover:bg-[#198049]"
          >
            <MessageCircleIcon className="size-4" aria-hidden />
            {t("vehicle.whatsapp")}
          </a>
        ) : null}
        <a
          href="#enquire"
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-lg text-sm font-semibold",
            !contact.phone || !contact.whatsapp ? "" : "col-span-2",
          )}
          style={{ background: "var(--sf-accent)", color: "var(--sf-on-accent)" }}
        >
          <SendIcon className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("vehicle.enquire")}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <SaveButton stockNumber={stockNumber} title={title} variant="button" />
        <ShareButton title={title} />
      </div>
    </div>
  );
}

/** A bar pinned to the bottom on phones once the main buttons scroll away. */
export function MobileActionBar({
  stockNumber,
  title,
  price,
  contact,
}: {
  stockNumber: string;
  title: string;
  price: string;
  contact: Contact;
}) {
  const t = useTranslations("storefront");
  const text = useWhatsappText(title, stockNumber);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs">{title}</p>
              <p className="font-heading truncate font-semibold">{price}</p>
            </div>
            {contact.phone ? (
              <a
                href={telLink(contact.phone)}
                aria-label={t("vehicle.call")}
                className="inline-flex size-11 items-center justify-center rounded-lg"
                style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              >
                <PhoneIcon className="size-5" />
              </a>
            ) : null}
            {contact.whatsapp ? (
              <a
                href={whatsappLink(contact.whatsapp, text)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("vehicle.whatsapp")}
                className="inline-flex size-11 items-center justify-center rounded-lg bg-[#1f9d55] text-white"
              >
                <MessageCircleIcon className="size-5" />
              </a>
            ) : null}
            <a
              href="#enquire"
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold"
              style={{ background: "var(--sf-accent)", color: "var(--sf-on-accent)" }}
            >
              {t("vehicle.enquire")}
            </a>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
