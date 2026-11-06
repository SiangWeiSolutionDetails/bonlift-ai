import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcwIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import {
  useCreateCustomerItemScoresConfigVersion,
  useCustomerItemScoresConfigVersions,
} from "../queries";
import type { CustomerItemScoresConfigVersion } from "../type";

type CustomerItemScoresConfigVersionsProps = {
  brandId: string;
  latestVersionId: string;
  readOnly: boolean;
};

export function CustomerItemScoresConfigVersions({
  brandId,
  latestVersionId,
  readOnly,
}: CustomerItemScoresConfigVersionsProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const { data: versions, error, isPending } =
    useCustomerItemScoresConfigVersions(brandId);
  const restoreMutation = useCreateCustomerItemScoresConfigVersion();
  const [versionToRestore, setVersionToRestore] =
    useState<CustomerItemScoresConfigVersion | null>(null);

  // Versions are immutable, so restoring creates a new latest version with the old values.
  // A version from before the order limit existed has none to restore, so the current limit is kept.
  function restore(version: CustomerItemScoresConfigVersion) {
    restoreMutation.mutate({
      brandId,
      input: {
        halfLifeDays: version.halfLifeDays,
        topN: version.topN,
        maxRecentOrders: version.maxRecentOrders ?? undefined,
      },
    });
  }

  return (
    <div className="grid gap-3">
      <ConfirmDialog
        open={versionToRestore !== null}
        onCancel={() => setVersionToRestore(null)}
        onConfirm={() => versionToRestore && restore(versionToRestore)}
        title={t("customerItemScoresConfig.history.restoreConfirmTitle", {
          version: versionToRestore?.version,
        })}
        description={t("customerItemScoresConfig.history.restoreConfirmDescription")}
        confirmLabel={t("customerItemScoresConfig.history.restore")}
      />

      {isPending && <Skeleton className="h-16 w-full" />}

      {error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(error, tCommon)}
        </p>
      )}

      {versions && (
        <ol className="grid max-h-128 gap-2 overflow-y-auto">
          {versions.map((version) => (
            <VersionItem
              key={version.id}
              version={version}
              isLatest={version.id === latestVersionId}
              canRestore={!readOnly && version.id !== latestVersionId}
              isRestoring={restoreMutation.isPending}
              onRestore={() => setVersionToRestore(version)}
            />
          ))}
        </ol>
      )}

      {restoreMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(restoreMutation.error, tCommon)}
        </p>
      )}
    </div>
  );
}

type VersionItemProps = {
  version: CustomerItemScoresConfigVersion;
  isLatest: boolean;
  canRestore: boolean;
  isRestoring: boolean;
  onRestore: () => void;
};

function VersionItem({
  version,
  isLatest,
  canRestore,
  isRestoring,
  onRestore,
}: VersionItemProps) {
  const { t } = useTranslation("brands");

  return (
    <li className="rounded-xl bg-card px-4 py-3 shadow-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <div tabIndex={0} className="grid cursor-default gap-1 rounded-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {t("customerItemScoresConfig.version", { version: version.version })}
                </Badge>
                {isLatest && (
                  <Badge variant="success">
                    {t("customerItemScoresConfig.history.current")}
                  </Badge>
                )}
              </div>
              {canRestore && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                  disabled={isRestoring}
                  onClick={onRestore}
                >
                  <RotateCcwIcon />
                  {t("customerItemScoresConfig.history.restore")}
                </Button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(version.createdAt)}
              {version.createdBy &&
                ` · ${t("customerItemScoresConfig.history.by", { name: version.createdBy })}`}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
            <dt className="opacity-70">
              {t("customerItemScoresConfig.halfLifeDays")}
            </dt>
            <dd>{version.halfLifeDays}</dd>
            <dt className="opacity-70">{t("customerItemScoresConfig.topN")}</dt>
            <dd>{version.topN}</dd>
            <dt className="opacity-70">
              {t("customerItemScoresConfig.maxRecentOrders")}
            </dt>
            <dd>{version.maxRecentOrders ?? t("customerItemScoresConfig.noLimit")}</dd>
          </dl>
        </TooltipContent>
      </Tooltip>
    </li>
  );
}
