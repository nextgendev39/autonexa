import {
  FormFieldsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionCardSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, then the console: section index on the left, the settings cards on the right. */
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto w-full max-w-6xl gap-8">
      <PageHeaderSkeleton />
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <div className="hidden gap-2 lg:grid">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-lg" />
          ))}
        </div>
        <div className="grid gap-6">
          <SectionCardSkeleton>
            <FormFieldsSkeleton fields={4} />
          </SectionCardSkeleton>
          <SectionCardSkeleton bodyClassName="h-24" />
        </div>
      </div>
    </PageSkeleton>
  );
}
