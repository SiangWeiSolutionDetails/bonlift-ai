export function filterByName<T extends { name: string }>(
  records: T[] | undefined,
  searchText: string,
) {
  const search = searchText.trim().toLowerCase();
  if (!records || !search) return records;
  return records.filter((record) => record.name.toLowerCase().includes(search));
}
