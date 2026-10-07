export function pgResult<T = Record<string, unknown>>(
  rows: T[],
  rowCount: number = rows.length,
) {
  return { rows, rowCount };
}
