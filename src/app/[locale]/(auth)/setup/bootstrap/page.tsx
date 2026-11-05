import { redirect } from "next/navigation";

/** Legacy URL — kept so old bookmarks still reach Super Admin setup. */
export default function LegacyBootstrapRedirect() {
  redirect("/setup/super-admin");
}
