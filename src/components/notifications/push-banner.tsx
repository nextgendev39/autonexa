"use client";

import { useEffect, useState } from "react";
import { BellRingIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { enablePush, getPushState, type PushState } from "@/lib/notifications/push-client";

const DISMISS_KEY = "push-banner-dismissed-at";
/** A dismissed banner comes back after this long, while push is still off. */
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

/**
 * Asks on every page until push is on for this device (or dismissed for a week), so
 * booking alerts reach people when the app is closed. Mounting it also re-subscribes a
 * device that already allowed notifications, e.g. after signing out and back in.
 */
export function PushBanner() {
  const t = useTranslations("notifications.push");
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState()
      .catch((): PushState => "unsupported")
      .then((next) => {
        if (cancelled) return;
        setHidden(dismissedRecently());
        setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden || state !== "default") return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Without storage the banner simply returns on the next visit.
    }
  };

  return (
    <div className="border-brand/30 bg-brand/8 text-foreground mb-5 flex flex-wrap items-center gap-3 rounded-xl border p-4 shadow-xs">
      <span className="bg-brand/15 text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
        <BellRingIcon className="size-4.5" />
      </span>
      <div className="grid min-w-0 flex-1 basis-60 gap-1">
        <p className="font-medium">{t("bannerTitle")}</p>
        <p className="text-muted-foreground text-sm">{t("bannerDescription")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await enablePush();
              setState(next);
              if (next === "subscribed") toast.success(t("enabled"));
              else if (next === "denied") toast.error(t("blocked"));
            } catch {
              toast.error(t("failed"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("enable")}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("notNow")} onClick={dismiss}>
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
