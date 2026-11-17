import type { InviteUserInput } from "./type";

export type InviteFormState = {
  email: string;
  displayName: string;
  consoleRoleId: string | null;
  brandRoles: { brandId: string; roleId: string }[];
};

export function hasAnyRole({ consoleRoleId, brandRoles }: Pick<InviteFormState, "consoleRoleId" | "brandRoles">) {
  return consoleRoleId !== null || brandRoles.length > 0;
}

export function buildInviteBody(state: InviteFormState): InviteUserInput {
  const displayName = state.displayName.trim();
  return {
    email: state.email.trim(),
    ...(displayName && { displayName }),
    ...(state.consoleRoleId && { consoleRoleId: state.consoleRoleId }),
    ...(state.brandRoles.length > 0 && {
      brandRoles: state.brandRoles.map(({ brandId, roleId }) => ({ brandId, roleId })),
    }),
  };
}
