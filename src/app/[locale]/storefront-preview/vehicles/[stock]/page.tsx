import { VehicleScreen } from "@/components/storefront/screens/vehicle";
import { getPreviewView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ stock: string }> };

export default async function Page({ params }: Props) {
  const stockNumber = decodeURIComponent((await params).stock);
  return <VehicleScreen view={await getPreviewView()} stockNumber={stockNumber} />;
}
