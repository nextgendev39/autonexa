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
    <header className="animate-rise flex flex-col gap-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
            {title}
          </h1>
          <span
            className="bg-gold animate-grow-x mt-2 block h-0.5 w-10 rounded-full [animation-delay:150ms] ltr:origin-left rtl:origin-right"
            aria-hidden
          />
          {description ? (
            <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm text-pretty sm:text-[0.9375rem]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
