import { PageEyebrow } from "@/components/layout/page-eyebrow";

/**
 * AutoNexa page header: champagne eyebrow (from the navigation), display title, description,
 * and actions aligned to the title's baseline, closed by a hairline.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="animate-fade-in border-divider flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
      <div className="min-w-0">
        <PageEyebrow />
        <h1 className="font-heading text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.025em] text-balance sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm text-pretty sm:text-[0.9375rem]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
