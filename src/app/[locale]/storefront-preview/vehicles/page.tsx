import { ListingScreen } from "@/components/storefront/screens/listing";
import { getPreviewView } from "@/lib/storefront/view";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  return <ListingScreen view={await getPreviewView()} searchParams={await searchParams} />;
}
