export function filterUsers<T extends { email: string; displayName: string | null }>(
  users: T[] | undefined,
  searchText: string,
) {
  const search = searchText.trim().toLowerCase();
  if (!users || !search) return users;
  return users.filter(
    (user) =>
      user.email.toLowerCase().includes(search) ||
      (user.displayName ?? "").toLowerCase().includes(search),
  );
}
