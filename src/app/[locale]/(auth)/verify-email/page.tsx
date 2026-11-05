import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { VerifyEmailForm } from "@/components/forms/verify-email-form";
import { normalizeEmail } from "@/lib/auth/email-verification";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.verifyEmail.title") };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const t = await getTranslations();
  const query = await searchParams;
  const email = normalizeEmail(query.email);
  const reason = typeof query.reason === "string" ? query.reason : null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.verifyEmail.title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("auth.verifyEmail.description")}</p>
      </div>
      <VerifyEmailForm key={email ?? "none"} email={email} reason={reason} />
    </div>
  );
}
