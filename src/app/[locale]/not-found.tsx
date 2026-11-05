import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/feedback/empty-state";
import { Link } from "@/lib/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg items-center px-4">
      <EmptyState
        title={t("errors.notFoundTitle")}
        description={t("errors.notFoundDescription")}
        action={
          <Link href="/dashboard" className="text-sm font-medium underline-offset-4 hover:underline">
            {t("errors.home")}
          </Link>
        }
      />
    </div>
  );
}
