import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmMatch?: string;
};

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  confirmMatch,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [typedName, setTypedName] = useState("");
  const [activeName, setActiveName] = useState("");
  const expectedName = confirmMatch?.trim() ?? "";
  const nameToMatch = expectedName || activeName;
  const requiresMatch = nameToMatch.length > 0;
  const matches = !requiresMatch || typedName.trim() === nameToMatch;

  useEffect(() => {
    if (expectedName) setActiveName(expectedName);
  }, [expectedName]);

  useEffect(() => {
    if (!open) setTypedName("");
  }, [open]);

  function confirm(event: { preventDefault: () => void }) {
    if (!matches) {
      event.preventDefault();
      return;
    }
    onConfirm();
  }

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent
        className={requiresMatch ? "sm:max-w-md" : undefined}
        onOpenAutoFocus={(event) => {
          if (!inputRef.current) return;
          event.preventDefault();
          inputRef.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t("confirmSave.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? t("confirmSave.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requiresMatch && (
          <div className="grid gap-2">
            <Label htmlFor={inputId} className="font-normal">
              <Trans
                i18nKey="confirmDelete.prompt"
                values={{ name: nameToMatch }}
                components={{ name: <span className="font-bold" /> }}
              />
            </Label>
            <Input
              ref={inputRef}
              id={inputId}
              value={typedName}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTypedName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !matches) return;
                event.preventDefault();
                confirmRef.current?.click();
              }}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            ref={confirmRef}
            variant={requiresMatch ? "destructive" : "default"}
            disabled={!matches}
            onClick={confirm}
          >
            {confirmLabel ?? t("actions.save")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
