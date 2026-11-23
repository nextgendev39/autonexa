import {
  FormFieldsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionCardSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, then the identity column (obsidian card, account facts) beside the editable cards. */
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto w-full max-w-6xl gap-8">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="grid gap-6">
          <div className="bg-brand-panel grid justify-items-center gap-3 rounded-2xl p-6">
            <Skeleton className="size-20 rounded-full bg-white/10" />
            <Skeleton className="h-5 w-36 bg-white/10" />
            <Skeleton className="h-3.5 w-44 bg-white/10" />
          </div>
          <SectionCardSkeleton bodyClassName="h-32" />
        </div>
        <div className="grid gap-6">
          <SectionCardSkeleton>
            <FormFieldsSkeleton fields={4} />
          </SectionCardSkeleton>
          <SectionCardSkeleton>
            <FormFieldsSkeleton fields={2} />
          </SectionCardSkeleton>
        </div>
      </div>
    </PageSkeleton>
  );
}
