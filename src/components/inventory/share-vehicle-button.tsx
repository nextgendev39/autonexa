"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
  Share2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { vehicleTitle } from "@/components/inventory/inventory-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import type { VehicleListItem } from "@/types/vehicle";

type ShareVehicle = Pick<
  VehicleListItem,
  "id" | "status" | "year" | "make" | "model" | "variant" | "stockNumber"
>;

/** Cars that have left the business can't be shared (their links stop working too). */
const UNSHAREABLE = new Set(["sold", "delivered", "returned", "archived"]);

export function isShareableStatus(status: VehicleListItem["status"]) {
  return !UNSHAREABLE.has(status);
}

/**
 * Creates a public link for one car and lets the salesperson send it to a customer,
 * who can open it without logging in.
 */
export function ShareVehicleButton({
  vehicle,
  layout = "icon",
  className,
}: {
  vehicle: ShareVehicle;
  /** icon: card action bar · row: table row · button: labelled, for page headers. */
  layout?: "icon" | "row" | "button";
  className?: string;
}) {
  const t = useTranslations("inventory.share");
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  if (!can("vehicle.price.view") || !isShareableStatus(vehicle.status)) return null;

  const title = vehicleTitle(vehicle);
  const message = url ? t("message", { title, url }) : "";

  async function handleClick() {
    setLoading(true);
    const res = await fetch(`/api/vehicles/${vehicle.id}/share`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setLoading(false);
    if (json?.status !== "success") {
      toast.error(json?.message ?? t("failed"));
      return;
    }
    setUrl(json.data.url);
    setMissing(json.data.missing ?? []);
    setOpen(true);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title, text: t("message", { title, url: "" }).trim(), url });
    } catch {
      /* dismissed */
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    // Clicks (including inside the portalled dialog, which bubble through React) must not
    // reach clickable table rows.
    <span className="contents" data-row-stop onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant={layout === "row" ? "ghost" : "outline"}
        size={layout === "button" ? "default" : layout === "row" ? "icon-sm" : "icon"}
        className={cn(
          layout === "icon" && "size-9 shrink-0",
          layout === "row" && "text-muted-foreground",
          layout === "button" && "h-10 md:h-9",
          className,
        )}
        onClick={handleClick}
        disabled={loading}
        aria-label={t("button")}
        title={t("button")}
      >
        <Share2Icon className="size-4" aria-hidden />
        {layout === "button" ? t("button") : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { title })}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={url ?? ""}
              aria-label={t("linkLabel")}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copy}
              aria-label={t("copy")}
            >
              {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("hint")}</p>
          {missing.length > 0 ? (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {t("missing", {
                  items: missing.map((item) => t(`missingItems.${item}`)).join(", "),
                })}
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
            >
              <ExternalLinkIcon className="size-4" aria-hidden />
              {t("preview")}
            </a>
            <div className="flex gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white hover:bg-[#1ebe5b]"
              >
                <MessageCircleIcon className="size-4" aria-hidden />
                {t("whatsapp")}
              </a>
              {canNativeShare ? (
                <Button type="button" onClick={nativeShare}>
                  <Share2Icon aria-hidden />
                  {t("more")}
                </Button>
              ) : (
                <Button type="button" onClick={copy}>
                  <CopyIcon aria-hidden />
                  {t("copy")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
