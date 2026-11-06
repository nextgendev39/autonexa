import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMessages } from "next-intl/server";

import { LandingPage } from "@/components/landing/landing-page";
import { getSessionUser } from "@/lib/auth/session";

import type en from "../../../messages/en.json";

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = (await getMessages()).landing as unknown as (typeof en)["landing"];
  return { title: { absolute: meta.title }, description: meta.description };
}

/** The public face of the product. Signed-in people go straight to their work. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return <LandingPage />;
}
