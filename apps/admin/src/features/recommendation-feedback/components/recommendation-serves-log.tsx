import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { sortByRank } from "../feedback";
import { useRecommendationServes } from "../queries";
import { serveRunLinks, shortRunId, type ServeRunLink } from "../run-links";
import type { FeedbackFilters, ServeLogEntry } from "../type";
import { useFeedbackLabels } from "../use-feedback-labels";
import { ServedItemBadge } from "./served-item-badge";

type RecommendationServesLogProps = {
  brandId: string;
  filters: FeedbackFilters;
};

export function RecommendationServesLog({ brandId, filters }: RecommendationServesLogProps) {
  const { t } = useTranslation("recommendationFeedback");
  const { t: tCommon } = useTranslation();
  const serves = useRecommendationServes(brandId, filters);
  const rows = serves.data?.pages.flatMap((page) => page.serves) ?? [];

  return (
    <div className="grid content-start gap-4 rounded-xl bg-card p-5 shadow-panel">
      <h3 className="text-sm font-medium">{t("serves.title")}</h3>

      {serves.isPending && <Skeleton className="h-40 w-full" />}

      {serves.error && (
        <p className="text-sm text-destructive">{getErrorMessage(serves.error, tCommon)}</p>
      )}

      {serves.isSuccess && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("serves.empty")}</p>
      )}

      {rows.length > 0 && <ServesTable brandId={brandId} rows={rows} />}

      {serves.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-center"
          disabled={serves.isFetchingNextPage}
          onClick={() => serves.fetchNextPage()}
        >
          {t("serves.loadMore")}
        </Button>
      )}
    </div>
  );
}

function ServesTable({ brandId, rows }: { brandId: string; rows: ServeLogEntry[] }) {
  const { t } = useTranslation("recommendationFeedback");
  const { daypartLabel } = useFeedbackLabels();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("serves.time")}</TableHead>
          <TableHead>{t("serves.outlet")}</TableHead>
          <TableHead>{t("serves.channel")}</TableHead>
          <TableHead>{t("serves.daypart")}</TableHead>
          <TableHead>{t("serves.runs")}</TableHead>
          <TableHead>{t("serves.items")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((serve) => (
          <TableRow key={serve.id}>
            {/* The viewer's zone is the report's tz, so local time is the selected zone's time */}
            <TableCell className="tabular-nums">{formatDateTime(serve.servedAt)}</TableCell>
            <TableCell>{serve.outletName}</TableCell>
            <TableCell>
              {serve.channelCode ? (
                <span className="font-mono">{serve.channelCode}</span>
              ) : (
                <span className="text-muted-foreground">{t("serves.noChannel")}</span>
              )}
            </TableCell>
            <TableCell>{daypartLabel(serve.daypart)}</TableCell>
            <TableCell>
              <div className="flex flex-col items-start gap-1.5">
                {serveRunLinks(brandId, serve).map((link) => (
                  <ServeRunLinkLabel key={link.type} link={link} />
                ))}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col items-start gap-1.5">
                {sortByRank(serve.items).map((item) => (
                  <ServedItemBadge key={item.itemId} item={item} />
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// A deleted run has no page to open, so it is plain text.
function ServeRunLinkLabel({ link }: { link: ServeRunLink }) {
  const { t } = useTranslation("recommendationFeedback");
  const type = t(`serves.runType.${link.type}`);

  if (!link.available) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("serves.runUnavailable", { type })}
      </span>
    );
  }

  return (
    <Link
      {...link.target}
      className="text-xs font-medium underline-offset-4 hover:underline"
    >
      {type}{" "}
      <span className="font-mono font-normal text-muted-foreground">{shortRunId(link.runId)}</span>
    </Link>
  );
}
