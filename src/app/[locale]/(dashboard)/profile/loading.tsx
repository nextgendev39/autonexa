import {
  FormFieldsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionCardSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Identity banner, then details and password beside the account summary. */
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto w-full max-w-4xl">
      <PageHeaderSkeleton />
      <div className="bg-carbon flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:p-6">
        <Skeleton className="size-16 shrink-0 rounded-full bg-white/10 sm:size-20" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-6 w-48 bg-white/10" />
          <Skeleton className="h-4 w-56 bg-white/10" />
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-5 w-24 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          <SectionCardSkeleton>
            <FormFieldsSkeleton fields={4} />
          </SectionCardSkeleton>
          <SectionCardSkeleton>
            <FormFieldsSkeleton fields={3} />
          </SectionCardSkeleton>
        </div>
        <SectionCardSkeleton bodyClassName="h-80" />
      </div>
    </PageSkeleton>
  );
}
