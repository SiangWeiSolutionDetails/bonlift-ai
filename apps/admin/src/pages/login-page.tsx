import type { AuthProvider } from "@bonlift-ai/contracts";
import { useSearch } from "@tanstack/react-router";
import { ShieldCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signInHref } from "@/features/auth/api";

const KNOWN_ERROR_CODES = ["ACCOUNT_NOT_APPROVED", "SIGN_IN_FAILED"] as const;

type LoginErrorCode = (typeof KNOWN_ERROR_CODES)[number];

const MODULE_KEYS = ["outletPopularity", "customerAffinity", "alsoOrdered"] as const;

function toLoginErrorCode(error: string): LoginErrorCode {
  return KNOWN_ERROR_CODES.includes(error as LoginErrorCode)
    ? (error as LoginErrorCode)
    : "SIGN_IN_FAILED";
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" className="size-5" aria-hidden="true">
      <rect x="0" y="0" width="10" height="10" fill="#F25022" />
      <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
      <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
      <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function LoginHeader() {
  return (
    <header className="flex h-12 items-center justify-end gap-1 px-4 md:px-6">
      <ThemeSwitcher />
      <LanguageSwitcher />
    </header>
  );
}

function BrandMark() {
  const { t } = useTranslation("auth");

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <h1 className="text-[28px] font-bold tracking-tight">{t("signInTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("tagline")}</p>
    </div>
  );
}

function ModuleBadges() {
  const { t } = useTranslation("auth");

  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {MODULE_KEYS.map((key) => (
        <li key={key}>
          <Badge variant="outline" className="bg-card text-muted-foreground shadow-panel">
            {t(`modules.${key}`)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function SignInCard() {
  const { t } = useTranslation("auth");
  const { error, returnTo, selectAccount } = useSearch({ from: "/login" });
  const hrefFor = (provider: AuthProvider) => signInHref(provider, returnTo ?? "/", { selectAccount });

  return (
    <section className="grid w-full max-w-sm gap-6 rounded-2xl bg-card p-6 text-card-foreground shadow-panel">
      <p className="text-center text-sm text-muted-foreground">{t("signInSubtitle")}</p>
      {error !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t(`errors.${toLoginErrorCode(error)}`)}
        </p>
      )}
      <div className="grid gap-3">
        <Button asChild variant="outline" size="lg" className="w-full gap-3">
          <a href={hrefFor("google")}>
            <GoogleMark />
            {t("signInWithGoogle")}
          </a>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full gap-3">
          <a href={hrefFor("microsoft")}>
            <MicrosoftMark />
            {t("signInWithMicrosoft")}
          </a>
        </Button>
      </div>
      <Separator />
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="size-4 shrink-0" />
        {t("accessNote")}
      </p>
    </section>
  );
}

export function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <LoginHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
        <BrandMark />
        <SignInCard />
        <ModuleBadges />
      </main>
    </div>
  );
}
