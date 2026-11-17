import { useSearch } from "@tanstack/react-router";
import { ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

function GradientBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-[-20%] left-[10%] size-168 rounded-full bg-[#4285F4] opacity-25 blur-[120px] motion-safe:animate-[login-drift_18s_ease-in-out_infinite] dark:opacity-35" />
      <div className="absolute top-[20%] right-[-10%] size-144 rounded-full bg-[#9B72CB] opacity-25 blur-[120px] motion-safe:animate-[login-drift_22s_ease-in-out_infinite_reverse] dark:opacity-35" />
      <div className="absolute bottom-[-25%] left-[30%] size-136 rounded-full bg-[#D96570] opacity-20 blur-[120px] motion-safe:animate-[login-drift_26s_ease-in-out_infinite] dark:opacity-30" />
    </div>
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
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#4285F4,#9B72CB,#D96570)] text-white shadow-[0_8px_30px_-6px_#9B72CB]">
        <SparklesIcon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight">{t("signInTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
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
  const { error, returnTo } = useSearch({ from: "/login" });
  const loginHref = `/api/auth/login/google?returnTo=${encodeURIComponent(returnTo ?? "/")}`;

  return (
    <section className="grid w-full max-w-sm gap-6 rounded-2xl bg-card/80 p-6 text-card-foreground shadow-panel backdrop-blur-xl">
      <p className="text-center text-sm text-muted-foreground">{t("signInSubtitle")}</p>
      {error !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t(`errors.${toLoginErrorCode(error)}`)}
        </p>
      )}
      <Button asChild variant="outline" size="lg" className="w-full gap-3">
        <a href={loginHref}>
          <GoogleMark />
          {t("signInWithGoogle")}
        </a>
      </Button>
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
    <div className="relative isolate flex min-h-svh flex-col bg-background">
      <GradientBackdrop />
      <LoginHeader />
      <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
        <BrandMark />
        <SignInCard />
        <ModuleBadges />
      </main>
    </div>
  );
}
