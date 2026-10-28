import { useTranslation } from "react-i18next";
import { RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
      <h4 className="text-sm font-medium">
        {t("outletItemScoresConfig.history.title")}
      </h4>

      {isPending && <Skeleton className="h-16 w-full" />}

      {error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(error, tCommon)}
        </p>
      )}

      {versions && (
        <ol className="grid gap-2">
          {versions.map((version) => (
            <VersionItem
              key={version.id}
              version={version}
              isLatest={version.id === latestVersionId}
              canRestore={!readOnly && version.id !== latestVersionId}
              isRestoring={restoreMutation.isPending}
              onRestore={() => restore(version)}
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
  const { t, i18n } = useTranslation("brands");
  const dayparts =
    version.dayparts.length === 0
      ? t("outletItemScoresConfig.history.wholeDay")
      : version.dayparts
          .map(({ name, start, end }) => `${name} ${start}–${end}`)
          .join(", ");

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-muted px-4 py-3">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {t("outletItemScoresConfig.version", { version: version.version })}
          </span>
          {isLatest && (
            <Badge variant="success">
              {t("outletItemScoresConfig.history.current")}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(version.createdAt).toLocaleString(i18n.language)}
            {version.createdBy &&
              ` · ${t("outletItemScoresConfig.history.by", { name: version.createdBy })}`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("outletItemScoresConfig.history.summary", {
            halfLifeDays: version.halfLifeDays,
            topN: version.topN,
            dayparts,
          })}
        </p>
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
