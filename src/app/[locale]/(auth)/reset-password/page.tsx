import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasValidResetGrant, RESET_GRANT_COOKIE } from "@/lib/auth/password-reset-server";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.reset.title") };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations();
  const cookieStore = await cookies();
  // Only someone who just entered a valid reset code gets the form.
  const allowed = await hasValidResetGrant(cookieStore.get(RESET_GRANT_COOKIE)?.value);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.reset.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.reset.description")}</p>
      </div>
      {allowed ? (
        <ResetPasswordForm />
      ) : (
        <div className="grid gap-4">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t("auth.errors.session")}</AlertDescription>
          </Alert>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants({ variant: "brand" }), "h-11")}
          >
            {t("auth.reset.startOver")}
          </Link>
        </div>
      )}
    </div>
  );
}
