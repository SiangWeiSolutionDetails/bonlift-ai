import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnName } from "@/features/auth/api";
import { safeReturnTo } from "@/features/auth/name-confirmation";
import { meQueryOptions, useCurrentUser } from "@/features/auth/queries";
import { getErrorMessage } from "@/lib/error-message";

const DISPLAY_NAME_MAX = 200;

function useConfirmName() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { returnTo } = useSearch({ from: "/welcome" });
  return useMutation({
    mutationFn: updateOwnName,
    onSuccess: (me) => {
      queryClient.setQueryData(meQueryOptions.queryKey, me);
      router.history.push(safeReturnTo(returnTo));
    },
  });
}

function ConfirmNameCard() {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const me = useCurrentUser();
  const [name, setName] = useState(me.displayName ?? "");
  const mutation = useConfirmName();
  const trimmed = name.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(trimmed);
  }

  return (
    <form
      onSubmit={submit}
      className="grid w-full max-w-sm gap-4 rounded-2xl bg-card p-6 text-card-foreground shadow-panel"
    >
      <p className="text-sm text-muted-foreground">{t("welcome.explanation")}</p>
      <div className="grid gap-2">
        <Label htmlFor="welcome-name">{t("welcome.nameLabel")}</Label>
        <Input
          id="welcome-name"
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(mutation.error, tCommon)}
        </p>
      )}
      <Button type="submit" size="lg" disabled={mutation.isPending || !trimmed}>
        {t(mutation.isPending ? "welcome.continuing" : "welcome.continue")}
      </Button>
    </form>
  );
}

export function WelcomePage() {
  const { t } = useTranslation("auth");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-12 items-center justify-end gap-1 px-4 md:px-6">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
        <h1 className="text-center text-[28px] font-bold tracking-tight">{t("welcome.title")}</h1>
        <ConfirmNameCard />
      </main>
    </div>
  );
}
