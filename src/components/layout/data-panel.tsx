import { cn } from "@/lib/utils";

/**
 * AutoNexa data panel: one elevated surface holding a list's toolbar (filters, search,
 * view switches), its body and its footer (pagination) — instead of loose pieces on the page.
 * `well` gives the body a tinted inset for lists made of cards.
 */
export function DataPanel({
  toolbar,
  footer,
  children,
  well = false,
  className,
  bodyClassName,
  ...props
}: Omit<React.ComponentProps<"section">, "children"> & {
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  well?: boolean;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("bg-card rounded-panel overflow-hidden border shadow-sm", className)}
      {...props}
    >
      {toolbar ? (
        <div className="border-divider flex flex-col gap-3 border-b px-3 py-3 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
          {toolbar}
        </div>
      ) : null}
      <div className={cn(well && "bg-muted/35 p-3 sm:p-4", bodyClassName)}>{children}</div>
      {footer ? <div className="border-divider border-t px-3 py-3 sm:px-4">{footer}</div> : null}
    </section>
  );
}
