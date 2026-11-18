import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";

export function BrandSettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.settings")} />
      <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        {t("workspace.comingNext")}
      </p>
    </div>
  );
}
