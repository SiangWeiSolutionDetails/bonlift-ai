import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { CreateBrandApiKeyBodySchema } from "@bonlift-ai/contracts";
import { FieldError } from "@/components/field-error";
import { FieldHint } from "@/components/field-hint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { getErrorMessage } from "@/lib/error-message";
import { typeboxResolver } from "@/lib/typebox-resolver";
import { useCreateBrandApiKey } from "../queries";
import type { CreateBrandApiKeyInput, CreatedBrandApiKey } from "../type";
import { SecretKeyField } from "./secret-key-field";

const EXPIRES_IN_DAYS_MAX = 3650;

type CreateApiKeyDialogProps = {
  brandId: string;
  open: boolean;
  onClose: () => void;
};

export function CreateApiKeyDialog({ brandId, open, onClose }: CreateApiKeyDialogProps) {
  // The secret lives only here: cleared on close, never in the query cache.
  const [created, setCreated] = useState<CreatedBrandApiKey | null>(null);

  function close() {
    setCreated(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent
        // Once the key is shown, only Done closes the dialog, so a stray click or Escape can't lose it.
        onInteractOutside={(event) => created && event.preventDefault()}
        onEscapeKeyDown={(event) => created && event.preventDefault()}
        showCloseButton={!created}
      >
        {created ? (
          <CreatedKey created={created} onDone={close} />
        ) : (
          <CreateKeyForm brandId={brandId} onCreated={setCreated} onCancel={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type CreateKeyFormProps = {
  brandId: string;
  onCreated: (created: CreatedBrandApiKey) => void;
  onCancel: () => void;
};

function CreateKeyForm({ brandId, onCreated, onCancel }: CreateKeyFormProps) {
  const { t } = useTranslation("apiKeys");
  const { t: tCommon } = useTranslation();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CreateBrandApiKeyInput>({
    resolver: typeboxResolver(CreateBrandApiKeyBodySchema),
    defaultValues: { name: "" },
  });
  // Already trimmed by setValueAs, so a name of only spaces keeps the button disabled
  const name = useWatch({ control, name: "name" });
  // "0" is never expires. Kept as text so clearing the box does not snap back mid-typing.
  const [expiresText, setExpiresText] = useState("0");
  const createMutation = useCreateBrandApiKey();

  function applyExpires(raw: string) {
    setExpiresText(raw);
    const trimmed = raw.trim();
    const days = trimmed === "" ? 0 : Number(trimmed);
    // 0 is left out of the body: a missing expiry is a key that never expires.
    setValue("expiresInDays", days === 0 ? undefined : days, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const parsedExpires = Number(expiresText);
  const sliderDays =
    expiresText.trim() === "" || !Number.isFinite(parsedExpires)
      ? 0
      : Math.min(EXPIRES_IN_DAYS_MAX, Math.max(0, parsedExpires));

  function onSubmit(input: CreateBrandApiKeyInput) {
    createMutation.mutate(
      { brandId, input },
      {
        onSuccess: (created) => {
          onCreated(created);
          // Drops the mutation's own copy of the response, which holds the secret.
          createMutation.reset();
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>{t("list.createTitle")}</DialogTitle>
        <DialogDescription>{t("list.createDescription")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="api-key-name">{t("list.name")}</Label>
        <Input
          id="api-key-name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          {...register("name", { setValueAs: (value: string) => value.trim() })}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="api-key-expires">{t("list.expiresInDays")}</Label>
          <FieldHint id="api-key-expires-hint" hint={t("list.expiresInDaysHint")} />
        </div>
        <div className="flex items-start gap-4">
          <div className="grid flex-1 gap-1 pt-2.5">
            <Slider
              thumbLabel={t("list.expiresInDays")}
              value={[sliderDays]}
              min={0}
              max={EXPIRES_IN_DAYS_MAX}
              step={1}
              onValueChange={([days]) => applyExpires(String(days))}
              aria-describedby="api-key-expires-hint"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{t("list.expiresInDaysNeverMark")}</span>
              <span>{EXPIRES_IN_DAYS_MAX.toLocaleString()}</span>
            </div>
          </div>
          <Input
            id="api-key-expires"
            type="number"
            inputMode="numeric"
            min={0}
            max={EXPIRES_IN_DAYS_MAX}
            step={1}
            value={expiresText}
            aria-invalid={!!errors.expiresInDays}
            aria-describedby="api-key-expires-hint"
            onChange={(event) => applyExpires(event.target.value)}
            className="w-28 shrink-0"
          />
        </div>
        <FieldError
          message={
            errors.expiresInDays?.type === "maximum"
              ? "apiKeys:list.expiresInDaysMaximum"
              : errors.expiresInDays?.message
          }
        />
      </div>

      {createMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(createMutation.error, tCommon)}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tCommon("actions.cancel")}
        </Button>
        <Button type="submit" disabled={!name || createMutation.isPending}>
          {createMutation.isPending ? tCommon("actions.creating") : t("list.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

type CreatedKeyProps = {
  created: CreatedBrandApiKey;
  onDone: () => void;
};

function CreatedKey({ created, onDone }: CreatedKeyProps) {
  const { t } = useTranslation("apiKeys");

  return (
    <div className="grid gap-6">
      <DialogHeader>
        <DialogTitle>{t("list.createdTitle", { name: created.name })}</DialogTitle>
        <DialogDescription>{t("list.createdDescription")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="api-key-secret">{t("list.key")}</Label>
        <SecretKeyField
          id="api-key-secret"
          secret={created.key}
          keyPrefix={created.keyPrefix}
        />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
        {t("list.createdWarning")}
      </p>

      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t("list.done")}
        </Button>
      </DialogFooter>
    </div>
  );
}
