import { useTranslation } from "react-i18next";
import { FieldHint } from "@/components/field-hint";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShare, getMaxValue, toBarWidth } from "@/features/outlet-item-scores/format";
import { getErrorMessage } from "@/lib/error-message";
import { useRunItem } from "../queries";
import type { AffinityPartner } from "../type";

const LIFT_DECIMALS = 2;

type ItemPartnersProps = {
  runId: string;
  itemId: string;
};

export function ItemPartners({ runId, itemId }: ItemPartnersProps) {
  const { t, i18n } = useTranslation("itemAffinity");
  const { t: tCommon } = useTranslation();
  const result = useRunItem(runId, itemId);

  if (result.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (result.error) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {getErrorMessage(result.error, tCommon)}
      </p>
    );
  }

  const { itemName, nOrders, partners } = result.data;
  const topConfidence = getMaxValue(partners.map((partner) => partner.confidence));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid shrink-0 gap-0.5">
        <h3 className="font-medium">
          {t("partners.title", { item: itemName ?? itemId })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("partners.basis", { count: nOrders })}
        </p>
      </div>
      {/* The Table's own container does the scrolling, so the sticky header stays inside the box */}
      <div className="flex max-h-96 min-h-0 flex-col overflow-hidden rounded-xl border xl:max-h-none xl:flex-1 [&>[data-slot=table-container]]:min-h-0 [&>[data-slot=table-container]]:overflow-auto">
        <Table>
          {/* Cells carry the background and rule: a stuck header loses the row border and lets rows show through */}
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_var(--border)]">
            <TableRow>
              <TableHead className="w-12 text-right">{t("partners.rank")}</TableHead>
              <TableHead>{t("partners.item")}</TableHead>
              <TableHead className="min-w-48">
                <span className="inline-flex items-center gap-1.5">
                  {t("partners.confidence")}
                  <FieldHint
                    id="item-partners-confidence-hint"
                    hint={t("partners.confidenceHint")}
                  />
                </span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1.5">
                  {t("partners.lift")}
                  <FieldHint
                    id="item-partners-lift-hint"
                    hint={t("partners.liftHint")}
                  />
                </span>
              </TableHead>
              <TableHead className="text-right">{t("partners.together")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((partner) => (
              <TableRow key={partner.itemId}>
                <TableCell className="text-right font-semibold tabular-nums">
                  {partner.rank}
                </TableCell>
                {/* Long names wrap, so Lift and Orders Together stay in view without scrolling */}
                <TableCell className="whitespace-normal">
                  <PartnerLabel partner={partner} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 flex-1">
                      <div
                        className="h-full min-w-0.5 rounded-sm bg-primary"
                        style={{ width: toBarWidth(partner.confidence, topConfidence) }}
                      />
                    </div>
                    <span className="w-14 text-right text-sm tabular-nums">
                      {formatShare(partner.confidence, i18n.language)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {partner.lift.toLocaleString(i18n.language, {
                    minimumFractionDigits: LIFT_DECIMALS,
                    maximumFractionDigits: LIFT_DECIMALS,
                  })}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {partner.nPair.toLocaleString(i18n.language)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PartnerLabel({ partner }: { partner: AffinityPartner }) {
  return (
    <div className="grid">
      <span className="font-medium">{partner.itemName ?? partner.itemId}</span>
      {partner.itemName && (
        <span className="text-xs text-muted-foreground">{partner.itemId}</span>
      )}
    </div>
  );
}
