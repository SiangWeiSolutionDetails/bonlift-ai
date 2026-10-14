// Shallow compare: nested objects/arrays are compared by reference
export function getChanges<T extends object>(
  original: NoInfer<Partial<T>>,
  current: T,
): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(current) as (keyof T)[]) {
    const value = current[key];
    if (value !== undefined && value !== original[key]) changes[key] = value;
  }
  return changes;
}
