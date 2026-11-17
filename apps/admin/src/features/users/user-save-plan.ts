import { hasAnyRole } from "./invite-request";

export type BrandRoleAssignment = { brandId: string; roleId: string };

export type UserEditState = {
  displayName: string;
  consoleRoleId: string | null;
  brandRoles: BrandRoleAssignment[];
};

export type SaveStep =
  | { kind: "name"; displayName: string | null }
  | { kind: "consoleRole"; roleId: string | null }
  | { kind: "removeBrandRole"; brandId: string }
  | { kind: "changeBrandRole"; brandId: string; roleId: string }
  | { kind: "addBrandRole"; brandId: string; roleId: string };

export function diffBrandRoles(baseline: BrandRoleAssignment[], staged: BrandRoleAssignment[]) {
  const baselineRoles = new Map(baseline.map((entry) => [entry.brandId, entry.roleId]));
  const stagedIds = new Set(staged.map((entry) => entry.brandId));
  return {
    removals: baseline.filter((entry) => !stagedIds.has(entry.brandId)).map((entry) => entry.brandId),
    changes: staged.filter(
      (entry) => baselineRoles.has(entry.brandId) && baselineRoles.get(entry.brandId) !== entry.roleId,
    ),
    additions: staged.filter((entry) => !baselineRoles.has(entry.brandId)),
  };
}

export function keepsAnyRole(staged: UserEditState) {
  return hasAnyRole(staged);
}

// Order matters: additions run before removals so a swap never passes through zero roles
export function planUserSave(baseline: UserEditState, staged: UserEditState): SaveStep[] {
  const steps: SaveStep[] = [];
  const name = staged.displayName.trim();
  if (name !== baseline.displayName) steps.push({ kind: "name", displayName: name || null });
  const { removals, changes, additions } = diffBrandRoles(baseline.brandRoles, staged.brandRoles);
  for (const { brandId, roleId } of additions) steps.push({ kind: "addBrandRole", brandId, roleId });
  for (const { brandId, roleId } of changes) steps.push({ kind: "changeBrandRole", brandId, roleId });
  if (staged.consoleRoleId !== baseline.consoleRoleId) {
    steps.push({ kind: "consoleRole", roleId: staged.consoleRoleId });
  }
  for (const brandId of removals) steps.push({ kind: "removeBrandRole", brandId });
  return steps;
}

export function applySaveStep(baseline: UserEditState, step: SaveStep): UserEditState {
  switch (step.kind) {
    case "name":
      return { ...baseline, displayName: step.displayName ?? "" };
    case "consoleRole":
      return { ...baseline, consoleRoleId: step.roleId };
    case "removeBrandRole":
      return {
        ...baseline,
        brandRoles: baseline.brandRoles.filter((entry) => entry.brandId !== step.brandId),
      };
    default: {
      const others = baseline.brandRoles.filter((entry) => entry.brandId !== step.brandId);
      return { ...baseline, brandRoles: [...others, { brandId: step.brandId, roleId: step.roleId }] };
    }
  }
}
