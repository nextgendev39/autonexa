import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ErrorState } from "@/components/feedback/error-state";
import { ProfilePageClient } from "@/components/profile/profile-page-client";
import { requireUserContext } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/profile/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("profile.title") };
}

/** Every signed-in user can see and edit their own profile; no permission needed. */
export default async function ProfilePage() {
  const context = await requireUserContext();
  const profile = await getMyProfile(context);
  if (!profile) return <ErrorState />;
  return <ProfilePageClient profile={profile} />;
}
