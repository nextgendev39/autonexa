/** PostgREST returns at most this many rows per request (supabase/config.toml max_rows). */
export const ROW_CHUNK = 1000;
/** Safety stop, so a runaway table can't hold a request open forever. */
const ROW_LIMIT = 50_000;

// Rows come back loosely typed (the generated types don't cover every select), so the
// caller names the row shape via T, as elsewhere with `as unknown as Row[]`.
type Page = PromiseLike<{
  data: unknown[] | null;
  error: { code?: string; message: string } | null;
}>;

/**
 * Reads every row of a query in ROW_CHUNK-sized pages. `page(from, to)` must return the
 * query with a stable order and `.range(from, to)` applied.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => Page,
): Promise<{ data: T[]; error: { code: string; message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < ROW_LIMIT; from += ROW_CHUNK) {
    const { data, error } = await page(from, from + ROW_CHUNK - 1);
    if (error) return { data: rows, error: { code: error.code ?? "db_error", message: error.message } };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < ROW_CHUNK) break;
  }
  return { data: rows, error: null };
}
