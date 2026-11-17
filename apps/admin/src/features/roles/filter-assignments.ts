type Searchable = {
  email: string;
  displayName: string | null;
  brandName: string | null;
  tenantName: string | null;
};

export function filterAssignments<T extends Searchable>(
  assignments: T[] | undefined,
  searchText: string,
) {
  const search = searchText.trim().toLowerCase();
  if (!assignments || !search) return assignments;
  return assignments.filter((assignment) =>
    [assignment.displayName, assignment.email, assignment.brandName, assignment.tenantName].some(
      (field) => field?.toLowerCase().includes(search),
    ),
  );
}
