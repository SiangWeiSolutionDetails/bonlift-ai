import { useState, type FormEvent } from "react";
import { PERMISSIONS, type ConsoleAction } from "@bonlift-ai/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateRole, useRoleAssignments, useUpdateRole } from "../queries";
import { filterAssignments } from "../filter-assignments";
import { groupState, toggleGroup } from "../permission-selection";
import type { Role, RoleKindType } from "../type";

export type RoleDialogTarget =
  | { mode: "create"; kind: RoleKindType }
  | { mode: "edit"; role: Role }
  | { mode: "view"; role: Role };

type RoleDialogProps = {
  target: RoleDialogTarget | null;
  onClose: () => void;
};

function titleKey(target: RoleDialogTarget) {
  if (target.mode === "create") {
    return target.kind === "console" ? "dialog.createConsoleTitle" : "dialog.createBrandTitle";
  }
  return target.mode === "edit" ? "dialog.editTitle" : "dialog.viewTitle";
}

export function RoleDialog({ target, onClose }: RoleDialogProps) {
  const { t } = useTranslation("roles");
  // Kept after close so the title doesn't flip while the dialog animates out
  const [lastTarget, setLastTarget] = useState(target);
  if (target && target !== lastTarget) setLastTarget(target);
  const shown = target ?? lastTarget;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{shown && t(titleKey(shown))}</DialogTitle>
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

function AssignedUsers({ roleId, kind }: { roleId: string; kind: RoleKindType }) {
  const { t } = useTranslation("roles");
  const { t: tCommon } = useTranslation();
  const { data, isPending, error } = useRoleAssignments(roleId, true);
  const [searchText, setSearchText] = useState("");
  const filtered = filterAssignments(data, searchText);
  const isBrand = kind === "brand";

  return (
    <section className="grid min-w-0 gap-2">
      <div>
        <h3 className="text-sm font-medium">{t("dialog.assignedUsers")}</h3>
        <p className="text-sm text-muted-foreground">{t("dialog.assignedUsersHint")}</p>
      </div>
      {isPending && !error ? (
        <Skeleton className="h-5 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{getErrorMessage(error, tCommon)}</p>
      ) : !data.length ? (
        <p className="text-sm text-muted-foreground">{t("dialog.noAssignedUsers")}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Input
              type="search"
              className="min-w-0 max-w-64"
              aria-label={t("dialog.assignedSearch")}
              placeholder={t("dialog.assignedSearch")}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <span className="shrink-0 text-sm text-muted-foreground">
              {searchText.trim()
                ? t("dialog.assignedFiltered", { shown: filtered?.length, total: data.length })
                : t("dialog.assignedCount", { count: data.length })}
            </span>
          </div>
          <div className="min-w-0 rounded-md border">
            <Table containerClassName="max-h-48 overflow-auto">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>{t("dialog.assignedEmail")}</TableHead>
                  <TableHead>{t("dialog.assignedName")}</TableHead>
                  <TableHead>{t("dialog.assignedStatus")}</TableHead>
                  {isBrand && <TableHead>{t("dialog.assignedBrand")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.length ? (
                  filtered.map((assignment) => (
                    <TableRow key={`${assignment.userId}-${assignment.brandId ?? ""}`}>
                      <TableCell className="max-w-36 truncate font-medium" title={assignment.email}>
                        {assignment.email}
                      </TableCell>
                      <TableCell
                        className="max-w-24 truncate"
                        title={assignment.displayName ?? undefined}
                      >
                        {assignment.displayName ?? "-"}
                      </TableCell>
                      <TableCell>
                        <UserStatusBadge status={assignment.status} />
                      </TableCell>
                      {isBrand && (
                        <TableCell className="max-w-32">
                          {assignment.brandName ? (
                            <div className="grid min-w-0">
                              <span className="truncate" title={assignment.brandName}>
                                {assignment.brandName}
                              </span>
                              {assignment.tenantName && (
                                <span
                                  className="truncate text-xs text-muted-foreground"
                                  title={assignment.tenantName}
                                >
                                  {assignment.tenantName}
                                </span>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={isBrand ? 4 : 3}
                      className="h-16 text-center text-muted-foreground"
                    >
                      {t("search.noMatches", { text: searchText.trim() })}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
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

  const groups = groupPermissions(kind);
  const allKeys = groups.flatMap(({ keys }) => keys);
  const effective: ReadonlySet<string> = isBuiltin ? new Set(allKeys) : selected;
  const isEnabled = (key: string) => !isReadOnly && !isLacking(key);

  function toggleKeys(keys: string[]) {
    setSelected((current) => toggleGroup(keys, current, isEnabled));
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
    createMutation.mutate({ name: trimmedName, actions }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="-mx-6 grid min-h-0 flex-1 gap-6 overflow-y-auto px-6">
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
          {kind === "brand" && (
            <p className="text-sm text-muted-foreground">{t("dialog.brandHint")}</p>
          )}
          <div className="grid gap-4">
            <label className="flex items-center gap-2 pl-7 text-sm font-semibold">
              <Checkbox
                checked={groupState(allKeys, effective)}
                disabled={!allKeys.some(isEnabled)}
                onCheckedChange={() => toggleKeys(allKeys)}
              />
              {t("dialog.selectAll")}
            </label>
            {groups.map(({ group, keys }) => {
              const groupName = tPermissions(`groups.${group}` as never);
              return (
                <Collapsible
                  key={group}
                  defaultOpen={target.mode === "create"}
                  className="group/collapsible grid gap-2"
                >
                  <div className="flex items-center gap-1">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={t("dialog.toggleGroup", { group: groupName })}
                      >
                        <ChevronRightIcon className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </Button>
                    </CollapsibleTrigger>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <Checkbox
                        checked={groupState(keys, effective)}
                        disabled={!keys.some(isEnabled)}
                        onCheckedChange={() => toggleKeys(keys)}
                      />
                      {groupName}
                    </label>
                  </div>
                  <CollapsibleContent className="grid gap-2 pl-13">
                    {keys.map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={effective.has(key)}
                          disabled={!isEnabled(key)}
                          onCheckedChange={() => setSelected((current) => toggled(current, key))}
                        />
                        {tPermissions(key as never)}
                      </label>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </fieldset>

        {existing && canConsole("users.view") && <AssignedUsers roleId={existing.id} kind={kind} />}

        {mutation.error && (
          <p className="text-sm text-destructive">{getErrorMessage(mutation.error, tCommon)}</p>
        )}
      </div>

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
