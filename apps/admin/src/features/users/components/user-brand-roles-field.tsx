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
import { usePermissions } from "@/features/auth/permissions";
import { useCurrentUser } from "@/features/auth/queries";
import { useBrands } from "@/features/brands/queries";
import type { Role } from "@/features/roles/type";
import { useTenants } from "@/features/tenants/queries";
import { cn } from "@/lib/utils";

export type BrandRoleEntry = {
  brandId: string;
  brandName: string;
  tenantName: string | null;
  roleId: string;
  roleName: string;
  removed: boolean;
};

type UserBrandRolesFieldProps = {
  entries: BrandRoleEntry[];
  roles: Role[];
  editable: boolean;
  disabled: boolean;
  errors: ReadonlyMap<string, string>;
  onChange: (entries: BrandRoleEntry[]) => void;
};

export function UserBrandRolesField({
  entries,
  roles,
  editable,
  disabled,
  errors,
  onChange,
}: UserBrandRolesFieldProps) {
  const { t } = useTranslation("users");

  function update(brandId: string, patch: Partial<BrandRoleEntry>) {
    onChange(entries.map((entry) => (entry.brandId === brandId ? { ...entry, ...patch } : entry)));
  }

  return (
    <div className="grid min-w-0 gap-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("brandRoles.empty")}</p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {entries.map((entry) => (
            <BrandRoleRow
              key={entry.brandId}
              entry={entry}
              roles={roles}
              editable={editable}
              disabled={disabled}
              error={errors.get(entry.brandId)}
              onChangeRole={(roleId) => update(entry.brandId, { roleId })}
              onToggleRemoved={(removed) => update(entry.brandId, { removed })}
            />
          ))}
        </ul>
      )}
      {editable && (
        <AddBrandRole
          assignedBrandIds={new Set(entries.map((entry) => entry.brandId))}
          roles={roles}
          disabled={disabled}
          onAdd={(entry) => onChange([...entries, entry])}
        />
      )}
    </div>
  );
}

type BrandRoleRowProps = {
  entry: BrandRoleEntry;
  roles: Role[];
  editable: boolean;
  disabled: boolean;
  error: string | undefined;
  onChangeRole: (roleId: string) => void;
  onToggleRemoved: (removed: boolean) => void;
};

function BrandRoleRow({
  entry,
  roles,
  editable,
  disabled,
  error,
  onChangeRole,
  onToggleRemoved,
}: BrandRoleRowProps) {
  const { t } = useTranslation("users");
  const roleName = roles.find((role) => role.id === entry.roleId)?.name ?? entry.roleName;

  return (
    <li className="grid min-w-0 gap-1 rounded-lg border p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className={cn("grid min-w-0", entry.removed && "line-through")}>
          <p
            className={cn(
              "truncate text-sm font-medium",
              entry.removed && "font-normal text-muted-foreground",
            )}
            title={entry.brandName}
          >
            {entry.brandName}
          </p>
          {entry.tenantName && (
            <p className="truncate text-xs text-muted-foreground" title={entry.tenantName}>
              {entry.tenantName}
            </p>
          )}
        </div>
        {editable ? (
          <div className="flex shrink-0 items-center gap-2">
            {!entry.removed && (
              <RoleSelect
                value={entry.roleId}
                roles={roles}
                disabled={disabled}
                label={t("brandRoles.roleFor", { brand: entry.brandName })}
                onChange={onChangeRole}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={entry.removed ? undefined : "text-destructive hover:text-destructive"}
              disabled={disabled}
              aria-label={t(entry.removed ? "brandRoles.undoFor" : "brandRoles.removeFrom", {
                brand: entry.brandName,
              })}
              onClick={() => onToggleRemoved(!entry.removed)}
            >
              {t(entry.removed ? "brandRoles.undo" : "brandRoles.remove")}
            </Button>
          </div>
        ) : (
          <span className="shrink-0 text-sm">{roleName}</span>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
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

// Without tenants.view, GET /tenants is refused, so the names come from the user's own brands
function useTenantNames() {
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const canViewTenants = canConsole("tenants.view");
  const { data: tenants = [] } = useTenants({ enabled: canViewTenants });
  if (canViewTenants) return new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  return new Map(me.brands.map((brand) => [brand.tenantId, brand.tenantName]));
}

type AddBrandRoleProps = {
  assignedBrandIds: ReadonlySet<string>;
  roles: Role[];
  disabled: boolean;
  onAdd: (entry: BrandRoleEntry) => void;
};

function AddBrandRole({ assignedBrandIds, roles, disabled, onAdd }: AddBrandRoleProps) {
  const { t } = useTranslation("users");
  const { data: brands = [] } = useBrands();
  const tenantNames = useTenantNames();
  const [brandId, setBrandId] = useState("");
  const [roleId, setRoleId] = useState("");
  const available = brands.filter((brand) => !assignedBrandIds.has(brand.id));

  function add() {
    const brand = available.find((option) => option.id === brandId);
    const role = roles.find((option) => option.id === roleId);
    if (!brand || !role) return;
    onAdd({
      brandId: brand.id,
      brandName: brand.name,
      tenantName: tenantNames.get(brand.tenantId) ?? null,
      roleId: role.id,
      roleName: role.name,
      removed: false,
    });
    setBrandId("");
    setRoleId("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <Select value={brandId} onValueChange={setBrandId} disabled={disabled}>
        <SelectTrigger size="sm" className="min-w-0 max-w-full flex-1 basis-40" aria-label={t("brandRoles.brand")}>
          <SelectValue placeholder={t("brandRoles.brandPlaceholder")}>
            {available.find((brand) => brand.id === brandId)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {available.map((brand) => {
            const tenantName = tenantNames.get(brand.tenantId);
            return (
              <SelectItem key={brand.id} value={brand.id} textValue={brand.name}>
                <span className="grid min-w-0">
                  <span className="truncate">{brand.name}</span>
                  {tenantName && (
                    <span className="truncate text-xs text-muted-foreground">{tenantName}</span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <RoleSelect
        value={roleId}
        roles={roles}
        disabled={disabled}
        label={t("brandRoles.role")}
        placeholder={t("brandRoles.rolePlaceholder")}
        onChange={setRoleId}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || !brandId || !roleId}
        onClick={add}
      >
        {t("brandRoles.add")}
      </Button>
    </div>
  );
}
