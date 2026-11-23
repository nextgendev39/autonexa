import { EmptyState } from "@/components/feedback/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The console's one table. Inside a card it runs edge to edge (cancelling the card padding);
 * it scrolls sideways on small screens rather than breaking the page.
 */
export function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: React.ReactNode[];
  rows: { key: string; cells: React.ReactNode[] }[];
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState inset title={empty} className="py-12" />;
  return (
    <div className="-mx-(--card-spacing,0px) overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header, index) => (
              <TableHead key={index}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, index) => (
                <TableCell key={index}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
