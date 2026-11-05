"use client";

import { useEffect, useState } from "react";
import { BellRingIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { enablePush, getPushState, type PushState } from "@/lib/notifications/push-client";
import { cn } from "@/lib/utils";

/** Lets a user turn on push alerts for this device. Hidden once on or when unavailable. */
export function PushPrompt({ className }: { className?: string }) {
  const t = useTranslations("notifications.push");
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState()
      .then((next) => !cancelled && setState(next))
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state !== "default" && state !== "denied") return null;
  if (state === "denied") return <span className={cn("text-muted-foreground text-xs", className)}>{t("blocked")}</span>;

  return (
    <Button
      size="sm"
      variant="ghost"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const next = await enablePush();
          setState(next);
          if (next === "subscribed") toast.success(t("enabled"));
        } catch {
          toast.error(t("failed"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <BellRingIcon />
      {t("enable")}
    </Button>
  );
}
