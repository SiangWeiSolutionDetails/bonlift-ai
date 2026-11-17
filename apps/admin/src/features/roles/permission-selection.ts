export type CheckState = boolean | "indeterminate";

export function groupState(actions: readonly string[], selected: ReadonlySet<string>): CheckState {
  const count = actions.filter((key) => selected.has(key)).length;
  if (count === 0) return false;
  return count === actions.length ? true : "indeterminate";
}

export function toggleGroup(
  actions: readonly string[],
  selected: ReadonlySet<string>,
  isEnabled: (key: string) => boolean,
) {
  const enabled = actions.filter(isEnabled);
  const allEnabledSelected = enabled.every((key) => selected.has(key));
  const next = new Set(selected);
  for (const key of enabled) {
    if (allEnabledSelected) next.delete(key);
    else next.add(key);
  }
  return next;
}
