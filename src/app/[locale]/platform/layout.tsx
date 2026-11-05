import { PlatformShell } from "@/components/platform/platform-shell";
import { requirePlatformPage } from "@/lib/platform/session";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePlatformPage();
  return <PlatformShell context={context}>{children}</PlatformShell>;
}
