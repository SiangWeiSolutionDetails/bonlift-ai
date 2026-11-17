import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roleKeys } from "@/features/roles/queries";
import {
  clearConsoleRole,
  disableUser,
  inviteUser,
  listUserBrandRoles,
  listUsers,
  reinviteUser,
  removeBrandRole,
  setBrandRole,
  setConsoleRole,
} from "./api";

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
  brandRoles: (userId: string) => [...userKeys.all, "brandRoles", userId] as const,
};

export function useUsers() {
  return useQuery({ queryKey: userKeys.list(), queryFn: ({ signal }) => listUsers(signal) });
}

export function useUserBrandRoles(userId: string | undefined) {
  return useQuery({
    queryKey: userKeys.brandRoles(userId ?? ""),
    queryFn: userId ? ({ signal }) => listUserBrandRoles(userId, signal) : skipToken,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: userKeys.list() });
}

export function useInviteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: inviteUser, onSuccess: invalidate });
}

export function useReinviteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: reinviteUser, onSuccess: invalidate });
}

export function useDisableUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: disableUser, onSuccess: invalidate });
}

// Assignment counts live on the roles list, so it changes with the user's console role
export function useChangeConsoleRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string | null }) => {
      if (roleId) await setConsoleRole(userId, roleId);
      else await clearConsoleRole(userId);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: userKeys.list() }),
        queryClient.invalidateQueries({ queryKey: roleKeys.all }),
      ]),
  });
}

function useInvalidateBrandRoles(userId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: userKeys.brandRoles(userId) }),
      queryClient.invalidateQueries({ queryKey: userKeys.list() }),
      queryClient.invalidateQueries({ queryKey: roleKeys.all }),
    ]);
}

export function useSetBrandRole(userId: string) {
  const invalidate = useInvalidateBrandRoles(userId);
  return useMutation({
    mutationFn: ({ brandId, roleId }: { brandId: string; roleId: string }) =>
      setBrandRole(brandId, userId, roleId),
    onSuccess: invalidate,
  });
}

export function useRemoveBrandRole(userId: string) {
  const invalidate = useInvalidateBrandRoles(userId);
  return useMutation({
    mutationFn: (brandId: string) => removeBrandRole(brandId, userId),
    onSuccess: invalidate,
  });
}
