"use client";

import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ListViewMode } from "@/hooks/use-list-view-mode";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type TableColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,select,textarea,label,[role='button'],[role='menuitem'],[data-row-stop]",
    ),
  );
}

export function ResponsiveTable<T extends { id: string }>({
  columns,
  rows,
  renderCard,
  bare = false,
  viewMode = "auto",
  hrefForRow,
  gridClassName,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  renderCard: (row: T) => React.ReactNode;
  /** Skip the framed container, e.g. when the table already sits inside a Card. */
  bare?: boolean;
  /**
   * `auto` / `list` — cards on phones, the table from md up (phones never get the table).
   * `grid` — card grid at all breakpoints.
   */
  viewMode?: ListViewMode | "auto";
  /** Makes the whole row open this href (interactive children are excluded). */
  hrefForRow?: (row: T) => string;
  gridClassName?: string;
}) {
  const router = useRouter();
  const showTable = viewMode !== "grid";

  return (
    <>
      <div
        className={cn(
          "stagger grid gap-3 [--stagger:45ms] sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
          gridClassName,
          showTable && "md:hidden",
        )}
      >
        {rows.map((row) => renderCard(row))}
      </div>

      {showTable ? (
        <div
          className={cn(
            bare
              ? ""
              : "bg-card ring-foreground/[0.07] overflow-hidden rounded-xl shadow-xs ring-1",
            "hidden md:block",
            viewMode === "list" && "overflow-x-auto",
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="stagger [--stagger:30ms]">
              {rows.map((row) => {
                const href = hrefForRow?.(row);
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      href && "hover:bg-brand-soft/50 cursor-pointer transition-colors",
                    )}
                    onClick={
                      href
                        ? (event) => {
                            if (isInteractiveTarget(event.target)) return;
                            router.push(href);
                          }
                        : undefined
                    }
                    onKeyDown={
                      href
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            if (isInteractiveTarget(event.target)) return;
                            event.preventDefault();
                            router.push(href);
                          }
                        : undefined
                    }
                    tabIndex={href ? 0 : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </>
  );
}
