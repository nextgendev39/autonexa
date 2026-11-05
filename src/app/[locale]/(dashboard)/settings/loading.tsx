import {
  FormFieldsSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  SectionCardSkeleton,
} from "@/components/feedback/skeletons";

/** Same narrow column as Settings: payment terms, then display preferences. */
export default function Loading() {
  return (
    <PageSkeleton className="mx-auto w-full max-w-4xl">
      <PageHeaderSkeleton />
      <SectionCardSkeleton action>
        <FormFieldsSkeleton fields={2} />
      </SectionCardSkeleton>
      <SectionCardSkeleton bodyClassName="h-24" />
    </PageSkeleton>
  );
}
