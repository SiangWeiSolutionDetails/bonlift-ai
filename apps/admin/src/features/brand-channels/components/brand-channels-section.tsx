import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useBrandChannels, useUpdateBrandChannel } from "../queries";
import type { BrandChannel } from "../type";

const SKELETON_ROW_COUNT = 3;
const COLUMN_COUNT = 3;

type BrandChannelsSectionProps = {
  brandId: string;
  readOnly: boolean;
};

// The channels themselves are a shared list that only changes through migrations; each brand switches them on or off.
// Changes apply immediately, so unlike the other tabs there is no Save footer.
export function BrandChannelsSection({ brandId, readOnly }: BrandChannelsSectionProps) {
  const { t } = useTranslation("brands");
  const { t: tCommon } = useTranslation();
  const { data: channels, error, isPending } = useBrandChannels(brandId);
  const updateMutation = useUpdateBrandChannel();
  const [channelToDeactivate, setChannelToDeactivate] = useState<BrandChannel | null>(null);

  function setActive(channel: BrandChannel, isActive: boolean) {
    updateMutation.mutate({ brandId, channelId: channel.channelId, input: { isActive } });
  }

  return (
    <div className="-mx-6 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-1">
      <ConfirmDialog
        open={channelToDeactivate !== null}
        title={t("channels.deactivateConfirmTitle", { name: channelToDeactivate?.name })}
        description={t("channels.deactivateConfirmDescription")}
        confirmLabel={t("channels.deactivate")}
        onCancel={() => setChannelToDeactivate(null)}
        onConfirm={() => channelToDeactivate && setActive(channelToDeactivate, false)}
      />
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">{t("channels.description")}</p>
        <p className="text-sm text-muted-foreground">{t("channels.defaultsHint")}</p>
      </div>

      {updateMutation.error && (
        <p className="text-sm text-destructive">
          {getErrorMessage(updateMutation.error, tCommon)}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("channels.name")}</TableHead>
              <TableHead className="w-40">{t("channels.code")}</TableHead>
              <TableHead className="w-24">{t("channels.active")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <MessageRow colSpan={COLUMN_COUNT} className="text-destructive">
                {getErrorMessage(error, tCommon)}
              </MessageRow>
            ) : !channels?.length ? (
              <MessageRow colSpan={COLUMN_COUNT}>{t("channels.empty")}</MessageRow>
            ) : (
              channels.map((channel) => (
                <TableRow key={channel.channelId}>
                  <TableCell className="font-medium">{channel.name}</TableCell>
                  <TableCell className="font-mono">{channel.code}</TableCell>
                  <TableCell>
                    {/* Switching off stops the channel's keys, so it asks first; switching on does not */}
                    <Switch
                      checked={channel.isActive}
                      disabled={readOnly || updateMutation.isPending}
                      aria-label={t("channels.activeLabel", { name: channel.name })}
                      onCheckedChange={(isActive) =>
                        isActive ? setActive(channel, true) : setChannelToDeactivate(channel)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type MessageRowProps = {
  colSpan: number;
  children: ReactNode;
  className?: string;
};

function MessageRow({ colSpan, children, className }: MessageRowProps) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={cn("h-24 text-center text-muted-foreground", className)}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
