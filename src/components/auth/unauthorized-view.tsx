import { getTranslations } from "next-intl/server";

import { LockKeyholeIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";

export async function UnauthorizedView() {
  const t = await getTranslations();

  return (
    <div className="gradient-card rounded-panel mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center gap-4 border px-6 py-16 text-center shadow-sm">
      <span className="bg-card ring-border relative flex size-16 items-center justify-center rounded-full shadow-sm ring-1">
        <span className="ring-brand/20 absolute inset-1.5 rounded-full ring-1" aria-hidden />
        <LockKeyholeIcon className="text-brand size-6" aria-hidden />
      </span>
      <p className="eyebrow">403</p>
      <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em]">
        {t("auth.unauthorized.title")}
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("auth.unauthorized.description")}</p>
      <Link href="/dashboard" className={buttonVariants({ className: "mt-2" })}>
        {t("auth.unauthorized.back")}
      </Link>
    </div>
  );
}
