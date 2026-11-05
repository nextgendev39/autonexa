import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

export async function UnauthorizedView() {
  const t = await getTranslations();

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 text-center">
      <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">403</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.unauthorized.title")}</h1>
      <p className="text-muted-foreground text-sm">{t("auth.unauthorized.description")}</p>
      <Link
        href="/dashboard"
        className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium"
      >
        {t("auth.unauthorized.back")}
      </Link>
    </div>
  );
}
