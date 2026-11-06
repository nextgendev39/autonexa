import { SavedScreen } from "@/components/storefront/screens/saved";
import { getPreviewView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <SavedScreen view={await getPreviewView()} />;
}
