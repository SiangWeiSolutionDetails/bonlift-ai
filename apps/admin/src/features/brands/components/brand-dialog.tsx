import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { getChanges } from "@/lib/get-changes";
import type { Brand, UpdateBrandInput } from "../type";
import { Controller, useForm } from "react-hook-form";
import { typeboxResolver } from "@/lib/typebox-resolver";
import { UpdateBrandBodySchema } from "@ai-services/contracts";
import { useUpdateBrand } from "../queries";
import { BrandDataSourceSection } from "@/features/brand-data-source/components/brand-data-source-section";
import { OutletItemScoresConfigSection } from "@/features/outlet-item-scores-config/components/outlet-item-scores-config-section";
import { CustomerItemScoresConfigSection } from "@/features/customer-item-scores-config/components/customer-item-scores-config-section";
type BrandDialogProps = {
  brand: Brand | null;
  readOnly?: boolean;
  onClose: () => void;
};

export function BrandDialog({ brand, readOnly = false, onClose }: BrandDialogProps) {
  const { t } = useTranslation("brands");
  const mode = readOnly ? "view" : "edit";

  return (
    <Dialog open={brand !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(`${mode}.title`)}</DialogTitle>
          <DialogDescription>{brand?.name}</DialogDescription>
        </DialogHeader>
        {brand && (
          // key resets every tab's form state when a different brand is opened.
          // Fixed height so switching tabs doesn't resize the dialog; min-h-0 lets it shrink on short screens.
          <Tabs key={brand.id} defaultValue="general" className="h-[36rem] min-h-0 gap-4">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="general" className="flex-none">
                {t("tabs.general")}
              </TabsTrigger>
              <TabsTrigger value="dataSource" className="flex-none">
                {t("dataSource.title")}
              </TabsTrigger>
              <TabsTrigger value="popularItems" className="flex-none">
                {t("outletItemScoresConfig.title")}
              </TabsTrigger>
              <TabsTrigger value="customerItems" className="flex-none">
                {t("customerItemScoresConfig.title")}
              </TabsTrigger>
            </TabsList>
            <BrandTab value="general">
              <BrandForm brand={brand} readOnly={readOnly} />
            </BrandTab>
            <BrandTab value="dataSource">
              <BrandDataSourceSection brandId={brand.id} readOnly={readOnly} />
            </BrandTab>
            <BrandTab value="popularItems">
              <OutletItemScoresConfigSection
                brandId={brand.id}
                readOnly={readOnly}
              />
            </BrandTab>
            <BrandTab value="customerItems">
              <CustomerItemScoresConfigSection
                brandId={brand.id}
                readOnly={readOnly}
              />
            </BrandTab>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Kept mounted while hidden, so unsaved edits survive switching tabs.
// Each tab's form scrolls its own fields so its footer stays pinned at the bottom.
function BrandTab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      forceMount
      className="flex min-h-0 flex-col data-[state=inactive]:hidden"
    >
      {children}
    </TabsContent>
  );
}

type PendingSave = {
  values: UpdateBrandInput;
  changes: UpdateBrandInput;
};

type BrandFormProps = {
  brand: Brand;
  readOnly: boolean;
};

function BrandForm({ brand, readOnly }: BrandFormProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateBrandInput>({
    resolver: typeboxResolver(UpdateBrandBodySchema),
    defaultValues: { name: brand.name, isActive: brand.isActive },
  });

  const updateBrandMutation = useUpdateBrand();
  const isSubmitting = updateBrandMutation.isPending;
  const submitError = updateBrandMutation.error;
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  function onSubmit(values: UpdateBrandInput) {
    if (readOnly) return;

    // PATCH only what changed; the API rejects an empty body (minProperties: 1)
    const changes = getChanges(brand, values);
    if (Object.keys(changes).length === 0) return;

    setPendingSave({ values, changes });
  }

  function save({ values, changes }: PendingSave) {
    updateBrandMutation.mutate(
      { brandId: brand.id, input: changes },
      { onSuccess: () => reset(values) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4">
      <ConfirmDialog
        open={pendingSave !== null}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => pendingSave && save(pendingSave)}
      />
      {/* Scroll inside the body so the scrollbar doesn't clip the dialog's rounded corners */}
      <div className="-mx-6 grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pb-1">
        <div className="grid gap-2">
          <Label htmlFor="brand-name">{t("edit.name")}</Label>
          <Input
            id="brand-name"
            readOnly={readOnly}
            aria-invalid={!!errors.name}
            {...register("name", { setValueAs: (value: string) => value.trim() })}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
          <Label htmlFor="brand-active">{t("edit.active")}</Label>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="brand-active"
                checked={field.value}
                disabled={readOnly}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        {submitError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(submitError, tCommon)}
          </p>
        )}
      </div>

      {!readOnly && (
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {tCommon("actions.cancel")}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? tCommon("actions.saving") : tCommon("actions.save")}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}
