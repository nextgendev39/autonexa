import {
  PageHeaderSkeleton,
  PageSkeleton,
  PanelSkeleton,
  TileGridSkeleton,
} from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Header, then the library: category rail on the left, the documents panel on the right. */
export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="flex gap-1.5 lg:grid lg:gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton
              key={index}
              className="h-8 w-24 shrink-0 rounded-full lg:h-9 lg:w-full lg:rounded-lg"
            />
          ))}
        </div>
        <PanelSkeleton chips={2} well>
          <TileGridSkeleton count={6} className="sm:grid-cols-2 2xl:grid-cols-3" />
        </PanelSkeleton>
      </div>
    </PageSkeleton>
  );
}
