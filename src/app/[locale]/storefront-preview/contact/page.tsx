import { ContactScreen } from "@/components/storefront/screens/contact";
import { getPreviewView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <ContactScreen view={await getPreviewView()} />;
}
