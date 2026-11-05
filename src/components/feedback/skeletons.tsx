import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Loading placeholders shaped like the real building blocks (PageHeader, KpiCard,
 * the list filter bar, ResponsiveTable, cards), so nothing jumps when data arrives.
 */

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Wraps a page placeholder; screen readers hear that it's loading. */
export function PageSkeleton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      {children}
    </div>
  );
}

/** Breadcrumbs, title with the gold underline, description and action buttons. */
export function PageHeaderSkeleton({
  actions = 0,
  description = true,
}: {
  actions?: number;
  description?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3.5 w-36" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Skeleton className="h-7 w-52 sm:h-8 sm:w-64" />
          <span className="bg-gold mt-2 block h-0.5 w-10 rounded-full opacity-60" aria-hidden />
          {description ? <Skeleton className="mt-2 h-4 w-72 max-w-full sm:w-96" /> : null}
        </div>
        {actions > 0 ? (
          <div className="flex w-full gap-2 sm:w-auto">
            {range(actions).map((index) => (
              <Skeleton
                key={index}
                className="h-10 flex-1 rounded-md sm:w-32 sm:flex-none md:h-9"
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One KPI card: label and icon tile on top, the figure and hint below. */
export function KpiCardSkeleton({ brand = false }: { brand?: boolean }) {
  return (
    <Card size="sm" className="relative gap-3 px-4 py-4 max-sm:gap-0 max-sm:px-3 max-sm:py-2.5">
      {brand ? (
        <span className="bg-gold absolute inset-x-0 top-0 h-0.5 opacity-60" aria-hidden />
      ) : null}
      {/* Phones: the compact row (icon, label, value). */}
      <div className="flex items-center gap-2.5 sm:hidden">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="grid flex-1 gap-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 max-sm:hidden">
        <Skeleton className="mt-1 h-3.5 w-24" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <div className="grid gap-1.5 max-sm:hidden">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </Card>
  );
}

export function KpiRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4", className)}>
      {range(count).map((index) => (
        <KpiCardSkeleton key={index} brand={index === 0} />
      ))}
    </div>
  );
}

/** Segmented filter tabs on the left, search on the right (Bookings, Customers). */
export function FilterBarSkeleton({
  tabs = 3,
  search = true,
}: {
  tabs?: number;
  search?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="bg-muted flex w-full gap-1 rounded-lg p-0.5 md:w-fit">
        {range(tabs).map((index) => (
          <Skeleton
            key={index}
            className={cn(
              "h-8 flex-1 md:w-24 md:flex-none",
              index === 0 && "bg-background shadow-xs",
            )}
          />
        ))}
      </div>
      {search ? <Skeleton className="h-10 w-full md:h-9 md:max-w-xs" /> : null}
    </div>
  );
}

/** A table card: header labels, then rows that start with a thumbnail or avatar. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  lead = "thumb",
}: {
  rows?: number;
  columns?: number;
  /** What the first cell starts with. */
  lead?: "thumb" | "avatar" | "none";
}) {
  const rest = range(Math.max(columns - 1, 0));
  return (
    <div className="bg-card ring-foreground/[0.07] overflow-hidden rounded-xl shadow-xs ring-1">
      <div className="bg-muted/40 flex h-10 items-center gap-6 border-b px-4">
        <Skeleton className="h-3 w-24" />
        {rest.map((index) => (
          <Skeleton
            key={index}
            className={cn("ms-auto h-3 w-16", index > 1 && "hidden lg:block")}
          />
        ))}
      </div>
      {range(rows).map((row) => (
        <div key={row} className="flex items-center gap-6 border-b px-4 py-3 last:border-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {lead === "thumb" ? <Skeleton className="h-12 w-[4.5rem] shrink-0 rounded-lg" /> : null}
            {lead === "avatar" ? <Skeleton className="size-9 shrink-0 rounded-full" /> : null}
            <div className="grid min-w-0 flex-1 gap-2">
              <Skeleton className="h-3.5 w-2/5 max-w-56" />
              <Skeleton className="h-3 w-1/4 max-w-32" />
            </div>
          </div>
          {rest.map((index) => (
            <Skeleton
              key={index}
              className={cn(
                index === rest.length - 1 ? "h-8 w-20" : "h-5 w-16 rounded-full",
                index > 1 && index < rest.length - 1 && "hidden lg:block",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A compact record card, as lists show them on phones. */
export function RecordCardSkeleton() {
  return (
    <div className="bg-card grid gap-3 rounded-xl border p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    </div>
  );
}

/** Lists switch to cards on phones and a table from md up, like ResponsiveTable. */
export function ListSkeleton({
  rows = 6,
  columns = 5,
  lead = "thumb",
}: {
  rows?: number;
  columns?: number;
  lead?: "thumb" | "avatar" | "none";
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {range(Math.min(rows, 4)).map((index) => (
          <RecordCardSkeleton key={index} />
        ))}
      </div>
      <div className="hidden md:block">
        <TableSkeleton rows={rows} columns={columns} lead={lead} />
      </div>
    </>
  );
}

/** Inventory results: cards on phones (always), the table or grid from md up. */
export function VehicleResultsSkeleton({ view }: { view: "list" | "grid" }) {
  if (view === "grid") return <VehicleGridSkeleton />;
  return (
    <>
      <div className="md:hidden">
        <VehicleGridSkeleton count={4} />
      </div>
      <div className="hidden md:block">
        <TableSkeleton columns={7} />
      </div>
    </>
  );
}

/**
 * Inventory grid card: photo with chips, title, spec pills, location/price, action bar.
 * Phones: the compact horizontal card (photo on the side, status inside).
 */
export function VehicleCardSkeleton() {
  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
      <div className="flex flex-1 max-sm:flex-row sm:flex-col">
        <div className="relative shrink-0 max-sm:min-h-28 max-sm:w-28 sm:aspect-[16/10] sm:w-full">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="absolute inset-x-2.5 top-2.5 flex justify-between max-sm:hidden">
            <span className="bg-background/80 h-5 w-24 rounded-full" />
            <span className="bg-background/80 h-5 w-14 rounded-full" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 max-sm:gap-2 max-sm:p-3">
          <div className="flex gap-1.5 sm:hidden">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {range(4).map((index) => (
              <Skeleton
                key={index}
                className={cn("h-6 w-16 max-sm:h-5", index > 1 && "max-sm:hidden")}
              />
            ))}
          </div>
          <div className="mt-auto flex items-end justify-between border-t pt-3 max-sm:border-0 max-sm:pt-1">
            <Skeleton className="h-4 w-28 max-sm:w-20" />
            <Skeleton className="h-5 w-24 max-sm:w-16" />
          </div>
        </div>
      </div>
      <div className="bg-muted/30 flex gap-2 border-t px-3 py-2.5">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="size-9" />
      </div>
    </Card>
  );
}

export function VehicleGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {range(count).map((index) => (
        <VehicleCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** A Card with a title, description and a body of the given height. */
export function SectionCardSkeleton({
  className,
  bodyClassName = "h-56",
  action = false,
  children,
}: {
  className?: string;
  bodyClassName?: string;
  action?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-4.5 w-40" />
            <Skeleton className="h-3.5 w-56 max-w-full" />
          </div>
          {action ? <Skeleton className="h-8 w-24" /> : null}
        </div>
      </CardHeader>
      <CardContent>
        {children ?? <Skeleton className={cn("w-full rounded-lg", bodyClassName)} />}
      </CardContent>
    </Card>
  );
}

/** Rows of icon + two lines, as in activity feeds and notification lists. */
export function FeedSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-4">
      {range(rows).map((index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Label + input pairs laid out like a form section. */
export function FormFieldsSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {range(fields).map((index) => (
        <div key={index} className="grid content-start gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-full md:h-9" />
        </div>
      ))}
    </div>
  );
}

/** The Inventory filter panel: search and two selects, then Filters and view toggle. */
/** Matches ListFilterBar: phones show only search + the Filters button. */
export function FilterPanelSkeleton() {
  return (
    <div className="md:bg-card flex flex-col gap-3 md:rounded-xl md:border md:p-4">
      <div className="flex items-start gap-2 md:gap-3">
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
          <Skeleton className="h-11 md:col-span-2 md:h-10 xl:col-span-1" />
          <Skeleton className="hidden h-10 md:block" />
          <Skeleton className="hidden h-10 md:block" />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Skeleton className="size-11 md:h-10 md:w-24" />
          <Skeleton className="hidden h-10 w-20 md:block" />
        </div>
      </div>
    </div>
  );
}

/** Placeholder for the pipeline card while the summary loads. */
export function StockPipelineSkeleton() {
  return (
    <div className="bg-card ring-foreground/[0.07] grid gap-5 rounded-xl p-5 shadow-xs ring-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-full rounded-full" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {range(4).map((index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 sm:border-s sm:ps-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="grid gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </div>
  );
}

/** The whole Inventory list page while it loads. */
export function InventoryListSkeleton({ view = "list" }: { view?: "list" | "grid" }) {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={1} />
      {/* Phones: the single compact status card (total, bar, four statuses). */}
      <div className="bg-card ring-foreground/[0.07] grid gap-3 rounded-xl px-3.5 py-3 shadow-xs ring-1 md:hidden">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="ms-auto h-6 w-12" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-4 gap-2">
          {range(4).map((index) => (
            <div key={index} className="grid justify-items-center gap-1">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:block">
        <StockPipelineSkeleton />
      </div>
      <FilterPanelSkeleton />
      <VehicleResultsSkeleton view={view} />
    </PageSkeleton>
  );
}

/** The vehicle page: header, sticky tab bar, the photo + journey hero, then the overview cards. */
export function VehicleDetailSkeleton() {
  return (
    <PageSkeleton className="gap-5">
      <PageHeaderSkeleton actions={2} />
      <div className="bg-muted/40 flex gap-1 overflow-hidden rounded-2xl border p-1.5">
        {range(6).map((index) => (
          <Skeleton
            key={index}
            className={cn(
              "h-9 w-24 shrink-0 rounded-xl sm:h-10 sm:w-28",
              index === 0 && "bg-background shadow-sm",
            )}
          />
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="aspect-[16/10] rounded-none lg:aspect-auto lg:min-h-80" />
          <div className="grid content-start gap-5 p-5">
            <div className="grid grid-cols-4 gap-2">
              {range(4).map((index) => (
                <div key={index} className="grid justify-items-center gap-1.5">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {range(8).map((index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCardSkeleton className="lg:col-span-2" bodyClassName="h-40" />
        <SectionCardSkeleton bodyClassName="h-40" />
      </div>
    </PageSkeleton>
  );
}

/** Add / edit vehicle: header, then the stepper and a form section inside one card. */
/** One compact form section card: title, then label + input pairs in a 1/2/3 column grid. */
function FormSectionSkeleton({
  titleWidth = "w-36",
  fields,
  textarea = false,
}: {
  titleWidth?: string;
  fields: number;
  textarea?: boolean;
}) {
  return (
    <div className="bg-card ring-foreground/[0.07] grid gap-4 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
      <Skeleton className={cn("h-4.5", titleWidth)} />
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {range(fields).map((index) => (
          <div key={index} className="grid content-start gap-2">
            <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-16" : "w-24")} />
            <Skeleton className="h-11 w-full md:h-10" />
          </div>
        ))}
        {textarea ? (
          <div className="grid gap-2 sm:col-span-2 lg:col-span-3">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The vehicle details step: Basic information, Specifications, Appearance, Origin,
 * Location and Notes, each with the same number of fields as the real form.
 */
export function VehicleSectionsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <FormSectionSkeleton titleWidth="w-40" fields={11} />
      <FormSectionSkeleton fields={8} />
      <FormSectionSkeleton titleWidth="w-28" fields={2} />
      <FormSectionSkeleton titleWidth="w-20" fields={4} />
      <FormSectionSkeleton titleWidth="w-24" fields={2} />
      <FormSectionSkeleton titleWidth="w-16" fields={0} textarea />
    </div>
  );
}

/** Matches the full-screen vehicle step form: step bar, form sections, pinned actions. */
export function VehicleFormSkeleton() {
  const bleed = "-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8";
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-live="polite">
      {/* Step bar: close, title, step pills (desktop) or progress segments (phone). */}
      <div className={cn("bg-background sticky top-0 z-20 grid gap-2 border-b py-2.5", bleed)}>
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="grid flex-1 gap-1.5 md:flex-none">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36 md:hidden" />
          </div>
          <div className="ms-auto hidden items-center gap-1 md:flex">
            {range(4).map((index) => (
              <div key={index} className="flex items-center gap-1">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full py-1 ps-1 pe-3",
                    index === 0 && "bg-brand-soft",
                  )}
                >
                  <Skeleton className={cn("size-6 rounded-full", index === 0 && "bg-brand/30")} />
                  <Skeleton className="h-3.5 w-16" />
                </div>
                {index < 3 ? <span className="bg-border h-px w-4 lg:w-8" aria-hidden /> : null}
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-1 md:hidden" aria-hidden>
          {range(4).map((index) => (
            <span
              key={index}
              className={cn("h-1 flex-1 rounded-full", index === 0 ? "bg-brand/40" : "bg-muted")}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 py-4 lg:py-6">
        <VehicleSectionsSkeleton />
      </div>

      {/* Pinned actions: Back, then the wide Continue on phones. */}
      <div
        className={cn(
          "bg-background sticky bottom-0 z-20 flex gap-2 border-t pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:justify-end",
          bleed,
        )}
      >
        <Skeleton className="h-11 w-24 sm:h-9" />
        <Skeleton className="h-11 flex-1 sm:h-9 sm:w-32 sm:flex-none" />
      </div>
    </div>
  );
}

/** Rounded panel used on the booking page. */
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("bg-card rounded-2xl border p-5 shadow-xs", className)}>
      {children}
    </section>
  );
}

/** Booking page: car + customer, payment, and timeline rows, two-thirds / one-third. */
export function BookingDetailSkeleton() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton actions={3} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="bg-card overflow-hidden rounded-2xl border shadow-xs lg:col-span-2">
          <div className="grid sm:grid-cols-[minmax(0,15rem)_1fr]">
            <Skeleton className="aspect-[16/10] rounded-none sm:aspect-auto sm:min-h-48" />
            <div className="grid content-start gap-4 p-5">
              <div className="grid gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-2/3" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {range(6).map((index) => (
                  <div key={index} className="grid gap-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <Panel className="grid content-start gap-4">
          <Skeleton className="h-4 w-28" />
          {range(2).map((index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </Panel>
        <Panel className="grid gap-6 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <Skeleton className="mx-auto size-32 rounded-full" />
            <div className="grid gap-4">
              {range(3).map((index) => (
                <div key={index} className="grid gap-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel className="grid content-start gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </Panel>
        <Panel className="lg:col-span-2">
          <Skeleton className="mb-5 h-4 w-28" />
          <FeedSkeleton rows={4} />
        </Panel>
        <Panel className="grid content-start gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </Panel>
      </div>
    </PageSkeleton>
  );
}

/** A grid of tiles: icon, two lines and a footer (documents, branches). */
export function TileGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {range(count).map((index) => (
        <div key={index} className="bg-card grid gap-4 rounded-xl border p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Form sections as Cards: a title, then label + input pairs (vehicle and acquisition forms). */
export function FormSectionsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4" aria-busy="true">
      {range(count).map((index) => (
        <FormSectionSkeleton key={index} fields={index === 0 ? 6 : 3} />
      ))}
    </div>
  );
}

/** Label / value rows inside a Card (cost and document summaries). */
export function DetailCardSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Card className={className} aria-busy="true">
      <CardHeader>
        <Skeleton className="h-4.5 w-36" />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {range(rows).map((index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Two timeline cards side by side, as on the History tab. */
export function TimelineSkeleton({ cards = 2, items = 4 }: { cards?: number; items?: number }) {
  return (
    <div className={cn("grid gap-4", cards > 1 && "lg:grid-cols-2")} aria-busy="true">
      {range(cards).map((card) => (
        <Card key={card}>
          <CardHeader>
            <Skeleton className="h-4.5 w-32" />
          </CardHeader>
          <CardContent>
            <ol className="border-border relative ms-2 grid gap-5 border-s ps-5">
              {range(items).map((index) => (
                <li key={index} className="relative grid gap-1.5">
                  <span
                    className="bg-brand/40 ring-background absolute -start-[27px] top-1.5 size-2.5 rounded-full ring-4"
                    aria-hidden
                  />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Upload area and the photo tiles (Photos tab). */
export function PhotoManagerSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <div className="border-brand/25 bg-brand-soft/30 grid h-36 place-items-center rounded-xl border-2 border-dashed">
        <div className="grid justify-items-center gap-2">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {range(8).map((index) => (
          <Skeleton key={index} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Pricing tab: title, the price KPIs, then the corridor and cost cards. */
export function PricingPanelSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <KpiRowSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCardSkeleton bodyClassName="h-40" />
        <SectionCardSkeleton bodyClassName="h-40" />
      </div>
    </div>
  );
}

/** Documents tab: document groups as cards of rows. */
export function DocumentsPanelSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <div className="flex flex-wrap gap-1.5">
        {range(4).map((index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      {range(2).map((card) => (
        <Card key={card}>
          <CardHeader>
            <Skeleton className="h-4.5 w-36" />
          </CardHeader>
          <CardContent className="grid gap-3">
            <DocumentRowsSkeleton />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** File rows: icon, name and details, and an action. */
export function DocumentRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {range(rows).map((index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </>
  );
}
