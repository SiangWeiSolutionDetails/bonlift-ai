export interface Assignments {
  columns: string;
  placeholders: string;
  setClause: string;
  values: unknown[];
  nextPlaceholder: string;
}

export function buildAssignments(data: Record<string, unknown>): Assignments {
  const entries = Object.entries(data).filter(
    ([key, value]) =>
      key !== undefined &&
      value !== undefined &&
      key !== null &&
      value !== null,
  );

  const columns = entries.map(([key]) => key);
  const placeholders = entries.map((_, i) => `$${i + 1}`);
  const setClause = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  return {
    columns: columns.join(", "),
    placeholders: placeholders.join(", "),
    setClause: setClause.join(", "),
    values,
    nextPlaceholder: `$${entries.length + 1}`,
  };
}
