import { useTranslation } from "react-i18next";

export function FieldError({ message }: { message?: string }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <p className="text-sm text-destructive">
      {t(message, { defaultValue: t("validation.invalid") })}
    </p>
  );
}
