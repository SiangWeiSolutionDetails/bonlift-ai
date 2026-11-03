import { useState, type ReactNode } from "react";
import { CircleCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, formatDateTime } from "@/lib/date-format";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import {
  useBrandApiKeys,
  useDeleteBrandApiKey,
  useRevokeBrandApiKey,
} from "../queries";
import type { BrandApiKey } from "../type";

const COLUMN_COUNT = 6;
const SKELETON_ROW_COUNT = 5;
const MASKED_SECRET = "••••••••";

type BrandApiKeysTableProps = {
  brandId: string;
};

// Same layout as the Brands list: a panel holding the table, status badges, text actions on the right.
export function BrandApiKeysTable({ brandId }: BrandApiKeysTableProps) {
  const { t } = useTranslation("apiKeys");
  const { t: tCommon } = useTranslation();
  const { data: apiKeys, error, isPending } = useBrandApiKeys(brandId);
  const revokeMutation = useRevokeBrandApiKey();
  const deleteMutation = useDeleteBrandApiKey();
  const [keyToRevoke, setKeyToRevoke] = useState<BrandApiKey | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<BrandApiKey | null>(null);
  const actionError = revokeMutation.error ?? deleteMutation.error;

  return (
    <>
      <ConfirmDialog
        open={keyToRevoke !== null}
        title={t("list.revokeConfirmTitle", { name: keyToRevoke?.name })}
        description={t("list.revokeConfirmDescription")}
        confirmLabel={t("list.revoke")}
        confirmMatch={keyToRevoke?.name}
        onCancel={() => setKeyToRevoke(null)}
        onConfirm={() =>
          keyToRevoke && revokeMutation.mutate({ brandId, keyId: keyToRevoke.id })
        }
      />
      <ConfirmDialog
        open={keyToDelete !== null}
        title={t("list.deleteConfirmTitle", { name: keyToDelete?.name })}
        description={t("list.deleteConfirmDescription")}
        confirmLabel={t("list.delete")}
        confirmMatch={keyToDelete?.name}
        onCancel={() => setKeyToDelete(null)}
        onConfirm={() =>
          keyToDelete && deleteMutation.mutate({ brandId, keyId: keyToDelete.id })
        }
      />

      {actionError && (
        <p className="text-sm text-destructive">{getErrorMessage(actionError, tCommon)}</p>
      )}

      <div className="overflow-hidden rounded-xl bg-card shadow-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("list.name")}</TableHead>
              <TableHead>{t("list.key")}</TableHead>
              <TableHead className="w-32">{t("list.created")}</TableHead>
              <TableHead className="w-32">{t("list.expires")}</TableHead>
              <TableHead className="w-32">{t("list.status")}</TableHead>
              <TableHead className="w-24 text-right">
                <span className="sr-only">{t("list.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <ApiKeyRows
              apiKeys={apiKeys}
              isPending={isPending}
              error={error}
              onRevoke={setKeyToRevoke}
              onDelete={setKeyToDelete}
            />
          </TableBody>
        </Table>
      </div>
    </>
  );
}

type ApiKeyRowsProps = {
  apiKeys: BrandApiKey[] | undefined;
  isPending: boolean;
  error: Error | null;
  onRevoke: (apiKey: BrandApiKey) => void;
  onDelete: (apiKey: BrandApiKey) => void;
};

function ApiKeyRows({ apiKeys, isPending, error, onRevoke, onDelete }: ApiKeyRowsProps) {
  const { t } = useTranslation("apiKeys");
  const { t: tCommon } = useTranslation();

  if (isPending) {
    return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <TableRow key={index}>
        <TableCell colSpan={COLUMN_COUNT}>
          <Skeleton className="h-5 w-full" />
        </TableCell>
      </TableRow>
    ));
  }

  if (error) {
    return <MessageRow className="text-destructive">{getErrorMessage(error, tCommon)}</MessageRow>;
  }

  if (!apiKeys?.length) {
    return <MessageRow>{t("list.empty")}</MessageRow>;
  }

  return apiKeys.map((apiKey) => {
    const isLive = apiKey.status === "live";

    return (
      <TableRow key={apiKey.id}>
        <TableCell className="font-medium">{apiKey.name}</TableCell>
        <TableCell className="font-mono text-muted-foreground">
          {apiKey.keyPrefix}.{MASKED_SECRET}
        </TableCell>
        <TableCell
          className="text-muted-foreground"
          title={`${formatDateTime(apiKey.createdAt)} · ${apiKey.createdBy}`}
        >
          {formatDate(apiKey.createdAt)}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {apiKey.expiresAt ? formatDate(apiKey.expiresAt) : t("list.never")}
        </TableCell>
        <TableCell>
          <Badge variant={isLive ? "success" : "secondary"}>
            {isLive && <CircleCheckIcon />}
            {t(`list.statuses.${apiKey.status}`)}
          </Badge>
        </TableCell>
        {/* A live key is revoked first; only a key that can no longer authenticate can be deleted */}
        <TableCell className="text-right">
          {isLive ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              aria-label={t("list.revokeLabel", { name: apiKey.name })}
              onClick={() => onRevoke(apiKey)}
            >
              {t("list.revoke")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              aria-label={t("list.deleteLabel", { name: apiKey.name })}
              onClick={() => onDelete(apiKey)}
            >
              {t("list.delete")}
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  });
}

function MessageRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={COLUMN_COUNT}
        className={cn("h-24 text-center text-muted-foreground", className)}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
