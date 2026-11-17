import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/features/auth/permissions";
import { meQueryOptions, useCurrentUser } from "@/features/auth/queries";
import { brandMemberKeys } from "@/features/brand-members/queries";
import { roleKeys, useRoles } from "@/features/roles/queries";
import type { Role } from "@/features/roles/type";
import { getErrorMessage } from "@/lib/error-message";
import { runSaveStep } from "../api";
import { userKeys, useUserBrandRoles } from "../queries";
import type { UserBrandRole, UserRecord } from "../type";
import { applySaveStep, planUserSave, type SaveStep, type UserEditState } from "../user-save-plan";
import { UserBrandRolesField, type BrandRoleEntry } from "./user-brand-roles-field";

const NO_ROLE = "none";
const DISPLAY_NAME_MAX = 200;

type SavedChanges = { userId: string; brandIds: Set<string> };

type UserEditDialogProps = {
  user: UserRecord | null;
  onClose: () => void;
};

export function UserEditDialog({ user, onClose }: UserEditDialogProps) {
  // Kept after close so the title doesn't go blank while the dialog animates out
  const [lastUser, setLastUser] = useState(user);
  if (user && user !== lastUser) setLastUser(user);
  const shown = user ?? lastUser;
  const [saving, setSaving] = useState(false);
  const saved = useRef<SavedChanges | null>(null);
  const invalidate = useInvalidateSavedChanges();

  function recordSaved(userId: string, step: SaveStep) {
    saved.current ??= { userId, brandIds: new Set() };
    if ("brandId" in step) saved.current.brandIds.add(step.brandId);
  }

  function finishClose() {
    if (saved.current) void invalidate(saved.current);
    saved.current = null;
    onClose();
  }

  function close() {
    if (!saving) finishClose();
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate">{shown?.email}</DialogTitle>
        </DialogHeader>
        {user && (
          <UserEditBody
            key={user.id}
            user={user}
            saving={saving}
            onSavingChange={setSaving}
            onSaved={(step) => recordSaved(user.id, step)}
            onCancel={close}
            onDone={finishClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useInvalidateSavedChanges() {
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  return ({ userId, brandIds }: SavedChanges) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: userKeys.list() }),
      queryClient.invalidateQueries({ queryKey: userKeys.brandRoles(userId) }),
      queryClient.invalidateQueries({ queryKey: roleKeys.all }),
      ...[...brandIds].map((brandId) =>
        queryClient.invalidateQueries({ queryKey: brandMemberKeys.list(brandId) }),
      ),
      ...(userId.toLowerCase() === me.id.toLowerCase()
        ? [queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })]
        : []),
    ]);
}

type UserEditBodyProps = {
  user: UserRecord;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onSaved: (step: SaveStep) => void;
  onCancel: () => void;
  onDone: () => void;
};

function UserEditBody(props: UserEditBodyProps) {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const { data, error, isFetching } = useUserBrandRoles(props.user.id);
  // Latched, so a later background refetch doesn't unmount the form and lose staged edits
  const [ready, setReady] = useState(false);
  if (!ready && !isFetching) setReady(true);

  if (!ready) return <p className="text-sm text-muted-foreground">{t("edit.loading")}</p>;
  return (
    <UserEditForm
      {...props}
      initialBrandRoles={data ?? []}
      brandRolesError={error ? getErrorMessage(error, tCommon) : null}
    />
  );
}

function useEditAccess(user: UserRecord, brandRolesLoaded: boolean) {
  const me = useCurrentUser();
  const { canConsole } = usePermissions();
  const isSelf = user.id.toLowerCase() === me.id.toLowerCase();
  const adminLocked = !!user.consoleRole?.isBuiltin && !(me.console?.isAdmin ?? false);
  return {
    isSelf,
    adminLocked,
    canName: canConsole("users.edit"),
    canConsoleRole: canConsole("users.assignConsoleRoles"),
    canBrandRoles: canConsole("users.assignBrandRoles"),
    name: canConsole("users.edit") && !adminLocked,
    consoleRole: canConsole("users.assignConsoleRoles") && !isSelf && !adminLocked,
    brandRoles: canConsole("users.assignBrandRoles") && !isSelf && brandRolesLoaded,
  };
}

function toEntry(assignment: UserBrandRole): BrandRoleEntry {
  return {
    brandId: assignment.brandId,
    brandName: assignment.brandName,
    tenantName: assignment.tenantName,
    roleId: assignment.roleId,
    roleName: assignment.roleName,
    removed: false,
  };
}

function initialState(user: UserRecord, brandRoles: UserBrandRole[]): UserEditState {
  return {
    displayName: user.displayName ?? "",
    consoleRoleId: user.consoleRole?.id ?? null,
    brandRoles: brandRoles.map(({ brandId, roleId }) => ({ brandId, roleId })),
  };
}

type SaveFailure = { step: SaveStep; message: string };
type SaveReport = { saved: string[]; failed: { label: string; message: string } };

type UserEditFormProps = UserEditBodyProps & {
  initialBrandRoles: UserBrandRole[];
  brandRolesError: string | null;
};

function UserEditForm({
  user,
  saving,
  onSavingChange,
  onSaved,
  onCancel,
  onDone,
  initialBrandRoles,
  brandRolesError,
}: UserEditFormProps) {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation();
  const access = useEditAccess(user, brandRolesError === null);
  const { data: brandRoleOptions = [] } = useRoles("brand");
  const [baseline, setBaseline] = useState(() => initialState(user, initialBrandRoles));
  const [displayName, setDisplayName] = useState(baseline.displayName);
  const [consoleRoleId, setConsoleRoleId] = useState(baseline.consoleRoleId);
  const [entries, setEntries] = useState(() => initialBrandRoles.map(toEntry));
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [report, setReport] = useState<SaveReport | null>(null);
  const isReadOnly = !access.name && !access.consoleRole && !access.brandRoles;

  const staged: UserEditState = {
    displayName,
    consoleRoleId,
    brandRoles: entries
      .filter((entry) => !entry.removed)
      .map(({ brandId, roleId }) => ({ brandId, roleId })),
  };
  const steps = planUserSave(baseline, staged);

  function stepLabel(step: SaveStep) {
    if (step.kind === "name") return t("edit.steps.name");
    if (step.kind === "consoleRole") return t("edit.steps.consoleRole");
    const brand = entries.find((entry) => entry.brandId === step.brandId)?.brandName ?? "";
    return t("edit.steps.brandRole", { brand });
  }

  function finish(current: UserEditState, done: SaveStep[], failed: SaveFailure) {
    setBaseline(current);
    setEntries((all) =>
      all.filter(
        (entry) =>
          !entry.removed || current.brandRoles.some((role) => role.brandId === entry.brandId),
      ),
    );
    setFailure(failed);
    setReport({
      saved: done.map(stepLabel),
      failed: { label: stepLabel(failed.step), message: failed.message },
    });
    onSavingChange(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    onSavingChange(true);
    setFailure(null);
    setReport(null);
    let current = baseline;
    const done: SaveStep[] = [];
    for (const step of steps) {
      try {
        await runSaveStep(user.id, step);
      } catch (error) {
        finish(current, done, { step, message: getErrorMessage(error, tCommon) });
        return;
      }
      current = applySaveStep(current, step);
      done.push(step);
      onSaved(step);
    }
    onSavingChange(false);
    onDone();
  }

  function edited<T>(setter: (value: T) => void) {
    return (value: T) => {
      setFailure(null);
      setter(value);
    };
  }

  const brandErrors = new Map<string, string>();
  if (failure && "brandId" in failure.step) brandErrors.set(failure.step.brandId, failure.message);

  return (
    <form onSubmit={save} className="grid min-w-0 gap-6 [&>section]:min-w-0">
      <DisplayNameField
        value={displayName}
        editable={access.name}
        disabled={saving}
        hint={access.canName && access.adminLocked ? t("edit.adminLocked") : null}
        source={user.displayNameSource}
        error={failure?.step.kind === "name" ? failure.message : null}
        onChange={edited(setDisplayName)}
      />

      <section className="grid gap-2">
        {access.consoleRole ? (
          <Label htmlFor="user-console-role">{t("edit.consoleRole")}</Label>
        ) : (
          <p className="text-sm font-medium">{t("edit.consoleRole")}</p>
        )}
        <ConsoleRoleField
          user={user}
          value={consoleRoleId}
          editable={access.consoleRole}
          disabled={saving}
          onChange={edited(setConsoleRoleId)}
        />
        <LockHint access={access} canSection={access.canConsoleRole} />
        {failure?.step.kind === "consoleRole" && (
          <p className="text-sm text-destructive">{failure.message}</p>
        )}
      </section>

      <section className="grid gap-2">
        <p className="text-sm font-medium">{t("brandRoles.title")}</p>
        {access.canBrandRoles && access.isSelf && (
          <p className="text-sm text-muted-foreground">{t("table.ownRow")}</p>
        )}
        {brandRolesError ? (
          <p className="text-sm text-destructive">{brandRolesError}</p>
        ) : (
          <UserBrandRolesField
            entries={entries}
            roles={brandRoleOptions}
            editable={access.brandRoles}
            disabled={saving}
            errors={brandErrors}
            onChange={edited(setEntries)}
          />
        )}
      </section>

      {report && <SaveReportLine report={report} />}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {isReadOnly ? tCommon("actions.close") : tCommon("actions.cancel")}
        </Button>
        {!isReadOnly && (
          <Button type="submit" disabled={saving || steps.length === 0}>
            {tCommon(saving ? "actions.saving" : "actions.save")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

type DisplayNameFieldProps = {
  value: string;
  editable: boolean;
  disabled: boolean;
  hint: string | null;
  source: UserRecord["displayNameSource"];
  error: string | null;
  onChange: (value: string) => void;
};

function DisplayNameField({ value, editable, disabled, hint, source, error, onChange }: DisplayNameFieldProps) {
  const { t } = useTranslation("users");
  return (
    <section className="grid min-w-0 gap-2">
      <Label htmlFor="user-display-name">{t("edit.displayName")}</Label>
      <Input
        id="user-display-name"
        value={value}
        maxLength={DISPLAY_NAME_MAX}
        autoComplete="off"
        disabled={!editable || disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {editable && <p className="text-xs text-muted-foreground">{t("edit.displayNameHint")}</p>}
      {source && <p className="text-xs text-muted-foreground">{t(`edit.nameSource.${source}`)}</p>}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

type EditAccess = ReturnType<typeof useEditAccess>;

function LockHint({ access, canSection }: { access: EditAccess; canSection: boolean }) {
  const { t } = useTranslation("users");
  if (!canSection) return null;
  if (access.isSelf) return <p className="text-sm text-muted-foreground">{t("table.ownRow")}</p>;
  if (access.adminLocked) {
    return <p className="text-sm text-muted-foreground">{t("edit.adminLocked")}</p>;
  }
  return null;
}

// The built-in Admin role is only offered to Admins; a held role the viewer can't offer still shows
function consoleRoleOptions(roles: Role[], isAdmin: boolean, user: UserRecord) {
  const options: { id: string; name: string; disabled?: boolean }[] = roles.filter(
    (role) => !role.isBuiltin || isAdmin,
  );
  if (user.consoleRole && !options.some((role) => role.id === user.consoleRole?.id)) {
    options.push({ id: user.consoleRole.id, name: user.consoleRole.name, disabled: true });
  }
  return options;
}

type ConsoleRoleFieldProps = {
  user: UserRecord;
  value: string | null;
  editable: boolean;
  disabled: boolean;
  onChange: (roleId: string | null) => void;
};

function ConsoleRoleField({ user, value, editable, disabled, onChange }: ConsoleRoleFieldProps) {
  const { t } = useTranslation("users");
  const isAdmin = useCurrentUser().console?.isAdmin ?? false;
  const { data: roles = [] } = useRoles("console");

  if (!editable) {
    return <p className="text-sm">{user.consoleRole?.name ?? t("table.noRole")}</p>;
  }

  return (
    <Select
      value={value ?? NO_ROLE}
      onValueChange={(next) => onChange(next === NO_ROLE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id="user-console-role" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ROLE}>{t("table.noRole")}</SelectItem>
        {consoleRoleOptions(roles, isAdmin, user).map((role) => (
          <SelectItem key={role.id} value={role.id} disabled={role.disabled}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SaveReportLine({ report }: { report: SaveReport }) {
  const { t } = useTranslation("users");
  const separator = t("edit.listSeparator");
  return (
    <p className="text-sm">
      {report.saved.length > 0 && (
        <span className="text-muted-foreground">
          {`${t("edit.savedSummary", { items: report.saved.join(separator) })} `}
        </span>
      )}
      <span className="text-destructive">
        {t("edit.notSavedSummary", { item: report.failed.label, reason: report.failed.message })}
      </span>
    </p>
  );
}
