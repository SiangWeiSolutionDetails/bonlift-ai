import type { AuthProvider } from "@bonlift-ai/contracts";
import { useSearch } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ShieldCheckIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signInHref } from "@/features/auth/api";
import { forgetAccount, type KnownAccount } from "@/features/auth/known-accounts";
import { type ProviderButtonState, isProviderAvailable, providerButtonState } from "@/features/auth/providers";
import { useAuthProviders } from "@/features/auth/queries";
import { useKnownAccounts } from "@/features/auth/use-known-accounts";

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

function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

// Saved accounts and provider buttons share one row shape so their icons and text line up
const ROW_CLASS = "h-11 w-full justify-start gap-3 px-3";
// Leaves room for the remove button that sits over the row's right edge
const ACCOUNT_ROW_CLASS = `${ROW_CLASS} pr-12`;

type ProviderButtonProps = { state: ProviderButtonState; href: string; icon: ReactNode; label: string };

function ProviderButton({ state, href, icon, label }: ProviderButtonProps) {
  const content = (
    <>
      {icon}
      {label}
    </>
  );

  if (state === "enabled") {
    return (
      <Button asChild variant="outline" className={ROW_CLASS}>
        <a href={href}>{content}</a>
      </Button>
    );
  }

  return (
    <Button variant="outline" className={ROW_CLASS} disabled>
      {content}
    </Button>
  );
}

const PROVIDER_MARKS: Record<AuthProvider, () => ReactNode> = { google: GoogleMark, microsoft: MicrosoftMark };

type KnownAccountButtonProps = { account: KnownAccount; available: boolean; href: string };

function KnownAccountButton({ account, available, href }: KnownAccountButtonProps) {
  const { t } = useTranslation("auth");
  const Mark = PROVIDER_MARKS[account.provider];
  const name = account.displayName ?? account.email;
  const content = (
    <>
      <Mark />
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate font-medium">{name}</span>
        {name !== account.email && <span className="truncate text-xs text-muted-foreground">{account.email}</span>}
      </span>
    </>
  );
  if (!available) {
    return (
      <Button variant="outline" className={ACCOUNT_ROW_CLASS} disabled>
        {content}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" className={ACCOUNT_ROW_CLASS}>
      <a href={href} aria-label={t("continueAs", { email: account.email })} title={account.email}>
        {content}
      </a>
    </Button>
  );
}

type KnownAccountListProps = { accounts: KnownAccount[]; hrefFor: (account: KnownAccount) => string };

function RemoveSavedAccountButton({ email, onRemove }: { email: string; onRemove: () => void }) {
  const { t } = useTranslation("auth");

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
      aria-label={t("removeSavedAccount", { email })}
      title={t("removeSavedAccount", { email })}
      onClick={onRemove}
    >
      <XIcon />
    </Button>
  );
}

function KnownAccountList({ accounts, hrefFor }: KnownAccountListProps) {
  const { t } = useTranslation("auth");
  const { data: providers } = useAuthProviders();
  const [emailToRemove, setEmailToRemove] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <ConfirmDialog
        open={emailToRemove !== null}
        title={t("removeAccountConfirm.title", { email: emailToRemove })}
        description={t("removeAccountConfirm.savedDescription")}
        confirmLabel={t("removeAccountConfirm.confirm")}
        destructive
        onCancel={() => setEmailToRemove(null)}
        onConfirm={() => {
          if (emailToRemove) forgetAccount(emailToRemove);
          setEmailToRemove(null);
        }}
      />
      <p className="text-xs font-medium text-muted-foreground">{t("knownAccounts")}</p>
      <ul className="grid gap-2">
        {accounts.map((account) => (
          <li key={account.email} className="relative">
            <KnownAccountButton
              account={account}
              available={isProviderAvailable(providers, account.provider)}
              href={hrefFor(account)}
            />
            <RemoveSavedAccountButton email={account.email} onRemove={() => setEmailToRemove(account.email)} />
          </li>
        ))}
      </ul>
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
  const providers = useAuthProviders();
  const knownAccounts = useKnownAccounts();
  const hrefFor = (provider: AuthProvider) => signInHref(provider, returnTo ?? "/", { selectAccount });
  const accountHref = ({ provider, email }: KnownAccount) =>
    signInHref(provider, returnTo ?? "/", { loginHint: email });

  return (
    <section className="grid w-full max-w-sm gap-6 rounded-2xl bg-card p-6 text-card-foreground shadow-panel">
      <p className="text-center text-sm text-muted-foreground">{t("signInSubtitle")}</p>
      {error !== undefined && <ErrorAlert>{t(`errors.${toLoginErrorCode(error)}`)}</ErrorAlert>}
      {providers.isError && <ErrorAlert>{t("errors.PROVIDERS_UNAVAILABLE")}</ErrorAlert>}
      {knownAccounts.length > 0 && <KnownAccountList accounts={knownAccounts} hrefFor={accountHref} />}
      <div className="grid gap-3">
        {knownAccounts.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground">{t("orUseAnotherAccount")}</p>
        )}
        <ProviderButton
          state={providerButtonState(providers, "google")}
          href={hrefFor("google")}
          icon={<GoogleMark />}
          label={t("signInWithGoogle")}
        />
        <ProviderButton
          state={providerButtonState(providers, "microsoft")}
          href={hrefFor("microsoft")}
          icon={<MicrosoftMark />}
          label={t("signInWithMicrosoft")}
        />
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
