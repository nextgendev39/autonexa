import { ListSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/components/feedback/skeletons";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <ListSkeleton />
    </PageSkeleton>
  );
}
