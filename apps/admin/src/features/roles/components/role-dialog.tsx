import { useState, type FormEvent } from "react";
import { PERMISSIONS, type ConsoleAction } from "@bonlift-ai/contracts";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth/permissions";
import { getErrorMessage } from "@/lib/error-message";
import { useCreateRole, useUpdateRole } from "../queries";
import type { Role, RoleKindType } from "../type";

export type RoleDialogTarget =
  | { mode: "create"; kind: RoleKindType }
  | { mode: "edit"; role: Role }
  | { mode: "view"; role: Role };

type RoleDialogProps = {
  target: RoleDialogTarget | null;
  onClose: () => void;
};

const TITLE_KEYS = {
  create: "dialog.createTitle",
  edit: "dialog.editTitle",
  view: "dialog.viewTitle",
} as const;

export function RoleDialog({ target, onClose }: RoleDialogProps) {
  const { t } = useTranslation("roles");
  // Kept after close so the title doesn't flip while the dialog animates out
  const [lastTarget, setLastTarget] = useState(target);
  if (target && target !== lastTarget) setLastTarget(target);
  const shown = target ?? lastTarget;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shown && t(TITLE_KEYS[shown.mode])}</DialogTitle>
        </DialogHeader>
        {target && <RoleForm key={formKey(target)} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function formKey(target: RoleDialogTarget) {
  return target.mode === "create" ? `create-${target.kind}` : `${target.mode}-${target.role.id}`;
}

type PermissionGroup = { group: string; keys: string[] };

function groupPermissions(kind: RoleKindType): PermissionGroup[] {
  const groups = new Map<string, string[]>();
  for (const permission of PERMISSIONS) {
    if (permission.kind !== kind) continue;
    groups.set(permission.group, [...(groups.get(permission.group) ?? []), permission.key]);
  }
  return [...groups].map(([group, keys]) => ({ group, keys }));
}

function toggled(selected: ReadonlySet<string>, key: string) {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function RoleForm({ target, onDone }: { target: RoleDialogTarget; onDone: () => void }) {
  const { t } = useTranslation("roles");
  const { t: tPermissions } = useTranslation("permissions");
  const { t: tCommon } = useTranslation();
  const { canConsole } = usePermissions();
  const existing = target.mode === "create" ? null : target.role;
  const kind = target.mode === "create" ? target.kind : target.role.kind;
  const isBuiltin = !!existing?.isBuiltin;
  const isReadOnly = target.mode === "view" || isBuiltin;
  const [name, setName] = useState(existing?.name ?? "");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(existing?.actions));
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const mutation = existing ? updateMutation : createMutation;
  const trimmedName = name.trim();

  // The API refuses console actions the actor lacks; disabling keeps the list within what they may grant
  function isLacking(key: string) {
    return kind === "console" && !canConsole(key as ConsoleAction);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const actions = [...selected];
    if (existing) {
      updateMutation.mutate(
        { roleId: existing.id, input: { name: trimmedName, actions } },
        { onSuccess: onDone },
      );
      return;
    }
    createMutation.mutate({ name: trimmedName, kind, actions }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="role-name">{t("dialog.name")}</Label>
        <Input
          id="role-name"
          value={name}
          disabled={isReadOnly}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">{t("dialog.permissions")}</legend>
        {isBuiltin && <p className="text-sm text-muted-foreground">{t("dialog.builtinHint")}</p>}
        {!isReadOnly && kind === "console" && (
          <p className="text-sm text-muted-foreground">{t("dialog.lackedHint")}</p>
        )}
        <div className="grid max-h-80 gap-4 overflow-y-auto pr-1">
          {groupPermissions(kind).map(({ group, keys }) => (
            <div key={group} className="grid gap-2">
              <p className="text-sm font-semibold">{tPermissions(`groups.${group}` as never)}</p>
              {keys.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={isBuiltin || selected.has(key)}
                    disabled={isReadOnly || isLacking(key)}
                    onChange={() => setSelected((current) => toggled(current, key))}
                  />
                  {tPermissions(key as never)}
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      {mutation.error && (
        <p className="text-sm text-destructive">{getErrorMessage(mutation.error, tCommon)}</p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {isReadOnly ? tCommon("actions.close") : tCommon("actions.cancel")}
          </Button>
        </DialogClose>
        {!isReadOnly && (
          <Button type="submit" disabled={mutation.isPending || !trimmedName}>
            {existing
              ? tCommon(mutation.isPending ? "actions.saving" : "actions.save")
              : tCommon(mutation.isPending ? "actions.creating" : "actions.create")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
