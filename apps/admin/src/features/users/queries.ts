import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roleKeys } from "@/features/roles/queries";
import {
  deleteUser,
  disableUser,
  inviteUser,
  listUserBrandRoles,
  listUsers,
  reinviteUser,
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
    // The edit dialog seeds its baseline from this, so each open must read fresh data
    refetchOnMount: "always",
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

export function useDeleteUser() {
  const invalidateUsers = useInvalidateUsers();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      void invalidateUsers();
      void queryClient.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
}
