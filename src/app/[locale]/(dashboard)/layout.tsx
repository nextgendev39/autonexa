import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await requireUserContext();

  if (context.status === "INVITED") {
    // A session normally exists only after the invite code was verified, but never
    // let an unconfirmed email reach the app: send it back to verification.
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email_confirmed_at) {
      const email = data.user?.email ?? "";
      await supabase.auth.signOut();
      redirect(`/verify-email?${new URLSearchParams({ email, reason: "unverified" }).toString()}`);
    }
    redirect("/accept-invitation");
  }

  return <AppShell user={context}>{children}</AppShell>;
}
