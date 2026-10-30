import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcwIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingBadge } from "@/components/setting-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import {
  useCreateOutletItemScoresConfigVersion,
  useOutletItemScoresConfigVersions,
} from "../queries";
import type { OutletItemScoresConfigVersion } from "../type";

type OutletItemScoresConfigVersionsProps = {
  brandId: string;
  latestVersionId: string;
  readOnly: boolean;
};

export function OutletItemScoresConfigVersions({
  brandId,
  latestVersionId,
  readOnly,
}: OutletItemScoresConfigVersionsProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const { data: versions, error, isPending } =
    useOutletItemScoresConfigVersions(brandId);
  const restoreMutation = useCreateOutletItemScoresConfigVersion();
  const [versionToRestore, setVersionToRestore] =
    useState<OutletItemScoresConfigVersion | null>(null);

  // Versions are immutable, so restoring creates a new latest version with the old values.
  function restore(version: OutletItemScoresConfigVersion) {
    restoreMutation.mutate({
      brandId,
      input: {
        halfLifeDays: version.halfLifeDays,
        topN: version.topN,
        dayparts: version.dayparts,
      },
    });
  }

  return (
    <div className="grid gap-3">
      <ConfirmDialog
        open={versionToRestore !== null}
        onCancel={() => setVersionToRestore(null)}
        onConfirm={() => versionToRestore && restore(versionToRestore)}
        title={t("outletItemScoresConfig.history.restoreConfirmTitle", {
          version: versionToRestore?.version,
        })}
        description={t("outletItemScoresConfig.history.restoreConfirmDescription")}
        confirmLabel={t("outletItemScoresConfig.history.restore")}
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
  version: OutletItemScoresConfigVersion;
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
  const dayparts =
    version.dayparts.length === 0
      ? [t("outletItemScoresConfig.history.wholeDay")]
      : version.dayparts.map(({ name, start, end }) => `${name} ${start}–${end}`);

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-card px-4 py-3 shadow-xs">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t("outletItemScoresConfig.version", { version: version.version })}
          </Badge>
          {isLatest && (
            <Badge variant="success">
              {t("outletItemScoresConfig.history.current")}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(version.createdAt)}
            {version.createdBy &&
              ` · ${t("outletItemScoresConfig.history.by", { name: version.createdBy })}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SettingBadge>
            {t("outletItemScoresConfig.history.halfLife", {
              halfLifeDays: version.halfLifeDays,
            })}
          </SettingBadge>
          <SettingBadge>
            {t("outletItemScoresConfig.history.topN", { topN: version.topN })}
          </SettingBadge>
          {dayparts.map((daypart) => (
            <SettingBadge key={daypart}>
              {daypart}
            </SettingBadge>
          ))}
        </div>
      </div>
      {canRestore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRestoring}
          onClick={onRestore}
        >
          <RotateCcwIcon />
          {t("outletItemScoresConfig.history.restore")}
        </Button>
      )}
    </li>
  );
}
