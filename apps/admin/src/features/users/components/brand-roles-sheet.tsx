import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useBrands } from "@/features/brands/queries";
import { useRoles } from "@/features/roles/queries";
import type { Role } from "@/features/roles/type";
import { getErrorMessage } from "@/lib/error-message";
import { useRemoveBrandRole, useSetBrandRole, useUserBrandRoles } from "../queries";
import type { UserBrandRole, UserRecord } from "../type";

type BrandRolesSheetProps = {
  user: UserRecord | null;
  canEdit: boolean;
  onClose: () => void;
};

export function BrandRolesSheet({ user, canEdit, onClose }: BrandRolesSheetProps) {
  const { t } = useTranslation("users");
  // Kept after close so the title doesn't go blank while the sheet animates out
  const [lastUser, setLastUser] = useState(user);
  if (user && user !== lastUser) setLastUser(user);
  const shown = user ?? lastUser;

  return (
    <Sheet open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined} className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("brandRoles.title")}</SheetTitle>
          <SheetDescription>{shown?.email}</SheetDescription>
        </SheetHeader>
        {user && <BrandRolesBody key={user.id} userId={user.id} canEdit={canEdit} />}
      </SheetContent>
    </Sheet>
  );
}

function BrandRolesBody({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const { data: assignments, error, isPending } = useUserBrandRoles(userId);
  const { data: roles = [] } = useRoles("brand");
  const removeMutation = useRemoveBrandRole(userId);
  const setMutation = useSetBrandRole(userId);
  const mutationError = removeMutation.error ?? setMutation.error;

  function resetErrors() {
    removeMutation.reset();
    setMutation.reset();
  }

  if (isPending) {
    return <p className="px-4 text-sm text-muted-foreground">{t("brandRoles.loading")}</p>;
  }
  if (error) {
    return <p className="px-4 text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>;
  }

  return (
    <div className="grid gap-6 px-4 pb-4">
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("brandRoles.empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {assignments.map((assignment) => (
            <AssignmentRow
              key={assignment.brandId}
              assignment={assignment}
              roles={roles}
              canEdit={canEdit}
              busy={setMutation.isPending || removeMutation.isPending}
              onChangeRole={(roleId) => {
                resetErrors();
                setMutation.mutate({ brandId: assignment.brandId, roleId });
              }}
              onRemove={() => {
                resetErrors();
                removeMutation.mutate(assignment.brandId);
              }}
            />
          ))}
        </ul>
      )}

      {mutationError && (
        <p className="text-sm text-destructive">{getErrorMessage(mutationError, tCommon)}</p>
      )}

      {canEdit && (
        <AddAssignment
          assignedBrandIds={new Set(assignments.map((a) => a.brandId))}
          roles={roles}
          busy={setMutation.isPending}
          onAdd={(brandId, roleId) => {
            resetErrors();
            setMutation.mutate({ brandId, roleId });
          }}
        />
      )}
    </div>
  );
}

type AssignmentRowProps = {
  assignment: UserBrandRole;
  roles: Role[];
  canEdit: boolean;
  busy: boolean;
  onChangeRole: (roleId: string) => void;
  onRemove: () => void;
};

function AssignmentRow({
  assignment,
  roles,
  canEdit,
  busy,
  onChangeRole,
  onRemove,
}: AssignmentRowProps) {
  const { t } = useTranslation("users");
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{assignment.brandName}</p>
        <p className="truncate text-xs text-muted-foreground">{assignment.tenantName}</p>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-2">
          <RoleSelect
            value={assignment.roleId}
            roles={roles}
            disabled={busy}
            label={t("brandRoles.roleFor", { brand: assignment.brandName })}
            onChange={onChangeRole}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            aria-label={t("brandRoles.removeFrom", { brand: assignment.brandName })}
            onClick={onRemove}
          >
            {t("brandRoles.remove")}
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-sm">{assignment.roleName}</span>
      )}
    </li>
  );
}

type RoleSelectProps = {
  value: string;
  roles: Role[];
  disabled: boolean;
  label: string;
  placeholder?: string;
  onChange: (roleId: string) => void;
};

function RoleSelect({ value, roles, disabled, label, placeholder, onChange }: RoleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type AddAssignmentProps = {
  assignedBrandIds: ReadonlySet<string>;
  roles: Role[];
  busy: boolean;
  onAdd: (brandId: string, roleId: string) => void;
};

function AddAssignment({ assignedBrandIds, roles, busy, onAdd }: AddAssignmentProps) {
  const { t } = useTranslation("users");
  const { data: brands = [] } = useBrands();
  const [brandId, setBrandId] = useState("");
  const [roleId, setRoleId] = useState("");
  const available = brands.filter((brand) => !assignedBrandIds.has(brand.id));

  function add() {
    onAdd(brandId, roleId);
    setBrandId("");
    setRoleId("");
  }

  return (
    <div className="grid gap-3 border-t pt-4">
      <p className="text-sm font-semibold">{t("brandRoles.addTitle")}</p>
      <Select value={brandId} onValueChange={setBrandId} disabled={busy}>
        <SelectTrigger size="sm" className="w-full" aria-label={t("brandRoles.brand")}>
          <SelectValue placeholder={t("brandRoles.brandPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {available.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <RoleSelect
        value={roleId}
        roles={roles}
        disabled={busy}
        label={t("brandRoles.role")}
        placeholder={t("brandRoles.rolePlaceholder")}
        onChange={setRoleId}
      />
      <Button size="sm" disabled={busy || !brandId || !roleId} onClick={add}>
        {t("brandRoles.add")}
      </Button>
    </div>
  );
}
