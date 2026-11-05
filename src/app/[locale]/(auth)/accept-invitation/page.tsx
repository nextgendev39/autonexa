import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AcceptInvitationForm } from "@/components/forms/accept-invitation-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.invite.title") };
}

export default async function AcceptInvitationPage() {
  const t = await getTranslations();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.invite.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.invite.description")}</p>
      </div>
      <AcceptInvitationForm />
    </div>
  );
}
