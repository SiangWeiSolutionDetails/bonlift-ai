import { useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const KNOWN_ERROR_CODES = ["ACCOUNT_NOT_APPROVED", "SIGN_IN_FAILED"] as const;

type LoginErrorCode = (typeof KNOWN_ERROR_CODES)[number];

function toLoginErrorCode(error: string): LoginErrorCode {
  return KNOWN_ERROR_CODES.includes(error as LoginErrorCode)
    ? (error as LoginErrorCode)
    : "SIGN_IN_FAILED";
}

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { error, returnTo } = useSearch({ from: "/login" });
  const loginHref = `/api/auth/login/google?returnTo=${encodeURIComponent(returnTo ?? "/")}`;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <section className="grid w-full max-w-sm gap-6 rounded-2xl border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-center text-xl font-semibold tracking-tight">
          {t("signInTitle")}
        </h1>
        {error !== undefined && (
          <p role="alert" className="text-center text-sm text-destructive">
            {t(`errors.${toLoginErrorCode(error)}`)}
          </p>
        )}
        <Button asChild className="w-full">
          <a href={loginHref}>{t("signInWithGoogle")}</a>
        </Button>
      </section>
    </main>
  );
}
