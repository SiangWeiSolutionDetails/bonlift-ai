import { apiRequest } from "@/lib/api-client";
import type { InviteUserInput, UpdateUserInput, UserBrandRole, UserRecord } from "./type";
import type { SaveStep } from "./user-save-plan";

const userPath = (userId: string) => `/users/${encodeURIComponent(userId)}`;

const memberPath = (brandId: string, userId: string) =>
  `/brands/${encodeURIComponent(brandId)}/members/${encodeURIComponent(userId)}`;

export async function listUsers(signal: AbortSignal) {
  const data = await apiRequest<{ users: UserRecord[] }>("/users", { signal });
  return data.users;
}

export async function inviteUser(input: InviteUserInput) {
  return await apiRequest<UserRecord>("/users", { method: "POST", body: input });
}

export async function reinviteUser(userId: string) {
  return await apiRequest<UserRecord>(`${userPath(userId)}/reinvite`, { method: "POST" });
}

export async function disableUser(userId: string) {
  return await apiRequest<UserRecord>(`${userPath(userId)}/disable`, { method: "POST" });
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  return await apiRequest<UserRecord>(userPath(userId), { method: "PATCH", body: input });
}

export async function setConsoleRole(userId: string, roleId: string) {
  return await apiRequest<UserRecord>(`${userPath(userId)}/console-role`, {
    method: "PUT",
    body: { roleId },
  });
}

export async function clearConsoleRole(userId: string) {
  return await apiRequest<void>(`${userPath(userId)}/console-role`, { method: "DELETE" });
}

export async function listUserBrandRoles(userId: string, signal: AbortSignal) {
  return await apiRequest<UserBrandRole[]>(`${userPath(userId)}/brand-roles`, { signal });
}

export async function setBrandRole(brandId: string, userId: string, roleId: string) {
  return await apiRequest<unknown>(memberPath(brandId, userId), {
    method: "PUT",
    body: { roleId },
  });
}

export async function removeBrandRole(brandId: string, userId: string) {
  return await apiRequest<void>(memberPath(brandId, userId), { method: "DELETE" });
}

export async function runSaveStep(userId: string, step: SaveStep) {
  switch (step.kind) {
    case "name":
      return await updateUser(userId, { displayName: step.displayName });
    case "consoleRole":
      return step.roleId
        ? await setConsoleRole(userId, step.roleId)
        : await clearConsoleRole(userId);
    case "removeBrandRole":
      return await removeBrandRole(step.brandId, userId);
    default:
      return await setBrandRole(step.brandId, userId, step.roleId);
  }
}
