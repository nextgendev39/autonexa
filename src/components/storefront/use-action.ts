"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { platformRequest } from "@/components/platform/platform-ui";
import { useRouter } from "@/lib/i18n/navigation";

/** One call to the website API, with a toast and a refresh of the server data afterwards. */
export function useAction() {
  const router = useRouter();
  const t = useTranslations("storefrontAdmin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    options?: { quiet?: boolean },
  ) => {
    setPending(true);
    setError(null);
    const outcome = await platformRequest(path, method, body);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.message || t("failed"));
      toast.error(outcome.message || t("failed"));
      return false;
    }
    if (!options?.quiet) toast.success(t("saved"));
    router.refresh();
    return true;
  };
  return { run, pending, error };
}
