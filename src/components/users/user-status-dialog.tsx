"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { UserCheckIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/shared/loading-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { postAuthJson } from "@/lib/auth/client";
import type { UserListItem } from "@/lib/users/service";
import { cn } from "@/lib/utils";

export type StatusAction = "deactivate" | "activate";

const NEXT_STATUS = { deactivate: "disabled", activate: "active" } as const;

type Props = {
  user: UserListItem | null;
  action: StatusAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (id: string, status: UserListItem["status"]) => void;
};

/** Confirms deactivating an active user or reactivating an inactive one. */
export function UserStatusDialog({ user, action, open, onOpenChange, onChanged }: Props) {
  const t = useTranslations("modules.users");
  const tRoot = useTranslations();
  const [loading, setLoading] = useState(false);
  const status = NEXT_STATUS[action];
  const Icon = action === "deactivate" ? UserXIcon : UserCheckIcon;

  async function handleConfirm() {
    if (!user || loading) return;
    setLoading(true);
    const result = await postAuthJson(`/api/users/${user.id}`, { status }, "PATCH");
    setLoading(false);

    if (result.status === "error") {
      const key =
        Object.values(result.fieldErrors)[0] ??
        result.formError ??
        `modules.users.errors.${action}Failed`;
      toast.error(tRoot(key as Parameters<typeof tRoot>[0]));
      return;
    }

    toast.success(t(`${action}Success`, { name: user.displayName }));
    onOpenChange(false);
    onChanged(user.id, status);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              action === "deactivate"
                ? "bg-destructive/10 text-destructive"
                : "bg-brand-soft text-brand-strong ring-brand/30 dark:text-brand ring-1 ring-inset",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="grid gap-1.5">
            <DialogTitle>{t(`${action}Title`)}</DialogTitle>
            <DialogDescription>
              {user ? (
                <>
                  <span className="text-foreground font-medium">{user.displayName}</span>
                  {user.email ? <span dir="ltr"> ({user.email})</span> : null}
                  <br />
                </>
              ) : null}
              {t(`${action}Description`)}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogFooter className="mt-2" showCloseButton>
          <LoadingButton
            variant={action === "deactivate" ? "destructive" : "brand"}
            onClick={handleConfirm}
            loading={loading}
          >
            {!loading ? <Icon /> : null}
            {t(`${action}Confirm`)}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
