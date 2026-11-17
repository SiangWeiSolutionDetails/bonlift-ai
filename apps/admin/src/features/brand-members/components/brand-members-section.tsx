import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { ApiError } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-message";
import {
  useAddBrandMember,
  useBrandMembers,
  useBrandRoleOptions,
  useChangeBrandMemberRole,
  useRemoveBrandMember,
} from "../queries";
import type { BrandMember } from "../type";

type RoleOption = { id: string; name: string };

type BrandMembersSectionProps = {
  brandId: string;
  readOnly: boolean;
};

function useRoleOptions(members: BrandMember[], brandId: string): RoleOption[] {
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const { data: roles } = useBrandRoleOptions(canConsole("roles.view"));
  if (roles) return roles;

  const known = new Map<string, RoleOption>();
  const own = me.brands.find((brand) => brand.brandId === brandId);
  if (own) known.set(own.roleId, { id: own.roleId, name: own.roleName });
  for (const member of members) {
    known.set(member.roleId, { id: member.roleId, name: member.roleName });
  }
  return [...known.values()];
}

export function BrandMembersSection({ brandId, readOnly }: BrandMembersSectionProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const { data: members, error, isPending } = useBrandMembers(brandId);
  const roles = useRoleOptions(members ?? [], brandId);
  const addMutation = useAddBrandMember(brandId);
  const changeMutation = useChangeBrandMemberRole(brandId);
  const removeMutation = useRemoveBrandMember(brandId);
  const [toRemove, setToRemove] = useState<BrandMember | null>(null);
  const busy = changeMutation.isPending || removeMutation.isPending;
  const rowError = changeMutation.error ?? removeMutation.error;

  function resetRowErrors() {
    changeMutation.reset();
    removeMutation.reset();
  }

  return (
    <div className="-mx-6 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-1">
      <ConfirmDialog
        open={toRemove !== null}
        title={t("members.removeConfirmTitle", { name: toRemove?.displayName ?? toRemove?.email })}
        description={t("members.removeConfirmDescription")}
        confirmLabel={t("members.remove")}
        onCancel={() => setToRemove(null)}
        onConfirm={() => toRemove && removeMutation.mutate(toRemove.userId)}
      />
      <p className="text-sm text-muted-foreground">{t("members.description")}</p>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("members.empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              roles={roles}
              canEdit={!readOnly && member.userId.toLowerCase() !== me.id.toLowerCase()}
              busy={busy}
              onChangeRole={(roleId) => {
                resetRowErrors();
                changeMutation.mutate({ userId: member.userId, roleId });
              }}
              onRemove={() => {
                resetRowErrors();
                setToRemove(member);
              }}
            />
          ))}
        </ul>
      )}

      {rowError && <p className="text-sm text-destructive">{getErrorMessage(rowError, tCommon)}</p>}

      {!readOnly && <AddMemberForm roles={roles} mutation={addMutation} />}
    </div>
  );
}

type MemberRowProps = {
  member: BrandMember;
  roles: RoleOption[];
  canEdit: boolean;
  busy: boolean;
  onChangeRole: (roleId: string) => void;
  onRemove: () => void;
};

function MemberRow({ member, roles, canEdit, busy, onChangeRole, onRemove }: MemberRowProps) {
  const { t } = useTranslation("brands");
  const label = member.displayName ?? member.email;
  const options = roles.some((role) => role.id === member.roleId)
    ? roles
    : [...roles, { id: member.roleId, name: member.roleName }];

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        {member.displayName && (
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        )}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-2">
          <Select value={member.roleId} onValueChange={onChangeRole} disabled={busy}>
            <SelectTrigger size="sm" aria-label={t("members.roleFor", { name: label })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            aria-label={t("members.removeNamed", { name: label })}
            onClick={onRemove}
          >
            {t("members.remove")}
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-sm">{member.roleName}</span>
      )}
    </li>
  );
}

type AddMemberFormProps = {
  roles: RoleOption[];
  mutation: ReturnType<typeof useAddBrandMember>;
};

function AddMemberForm({ roles, mutation }: AddMemberFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState("");
  const trimmedEmail = email.trim();
  const trimmedName = displayName.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(
      { email: trimmedEmail, roleId, ...(trimmedName && { displayName: trimmedName }) },
      {
        onSuccess: () => {
          setEmail("");
          setDisplayName("");
          setRoleId("");
        },
      },
    );
  }

  const error = mutation.error;
  const errorMessage =
    error instanceof ApiError && error.status === 409
      ? t("members.accountDisabled")
      : error && getErrorMessage(error, tCommon);

  return (
    <form onSubmit={submit} className="grid gap-3 border-t pt-4">
      <p className="text-sm font-semibold">{t("members.addTitle")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="member-email">{t("members.email")}</Label>
          <Input
            id="member-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="member-name">{t("members.displayName")}</Label>
          <Input
            id="member-name"
            value={displayName}
            autoComplete="off"
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("members.displayNameHint")}</p>
        </div>
      </div>
      <Select value={roleId} onValueChange={setRoleId} disabled={mutation.isPending}>
        <SelectTrigger size="sm" className="w-full" aria-label={t("members.role")}>
          <SelectValue placeholder={t("members.rolePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button type="submit" size="sm" disabled={mutation.isPending || !trimmedEmail || !roleId}>
        {t(mutation.isPending ? "members.adding" : "members.add")}
      </Button>
    </form>
  );
}
