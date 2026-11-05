import type { Metadata } from "next";
import { CircleCheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/forms/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authErrorKeys } from "@/lib/auth/errors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.login.title") };
}

const REASON_MESSAGES: Record<string, string> = {
  suspended: authErrorKeys.accountSuspended,
  disabled: authErrorKeys.accountDisabled,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; reset?: string }>;
}) {
  const t = await getTranslations();
  const { reason, reset } = await searchParams;
  const notice = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.login.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.login.description")}</p>
      </div>
      {reset === "success" ? (
        <Alert role="status">
          <CircleCheckIcon className="text-emerald-600 dark:text-emerald-400" />
          <AlertDescription>{t("auth.reset.success")}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="destructive">
          <AlertDescription>{t(notice as Parameters<typeof t>[0])}</AlertDescription>
        </Alert>
      ) : null}
      <LoginForm />
    </div>
  );
}
