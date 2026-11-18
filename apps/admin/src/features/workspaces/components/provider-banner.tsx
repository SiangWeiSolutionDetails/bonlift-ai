import { EyeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrandWorkspace } from "../workspaces";

type ProviderBannerProps = { workspace: BrandWorkspace | null; isPending: boolean };

export function ProviderBanner({ workspace, isPending }: ProviderBannerProps) {
  const { t } = useTranslation("auth");

  return (
    <div
      role="status"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
    >
      <EyeIcon className="size-4 shrink-0" />
      <span className="shrink-0 font-medium">{t("workspaces.providerBanner")}</span>
      {isPending && <Skeleton className="h-4 w-40" />}
      {workspace && (
        <span className="min-w-0 truncate" title={`${workspace.tenantName} · ${workspace.brandName}`}>
          · {workspace.tenantName} · {workspace.brandName}
        </span>
      )}
    </div>
  );
}
