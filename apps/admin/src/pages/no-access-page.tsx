import { useTranslation } from "react-i18next";

export function NoAccessPage() {
  const { t } = useTranslation();

  return (
    <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
      {t("noAccess.message")}
    </p>
  );
}
