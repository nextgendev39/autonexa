import { ListSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";

/** Fallback for pages without their own loading screen: a header and a list. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <ListSkeleton />
    </PageSkeleton>
  );
}
