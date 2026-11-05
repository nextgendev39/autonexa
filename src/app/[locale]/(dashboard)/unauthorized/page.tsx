import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { UnauthorizedView } from "@/components/auth/unauthorized-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.unauthorized.title") };
}

export default function UnauthorizedPage() {
  return <UnauthorizedView />;
}
