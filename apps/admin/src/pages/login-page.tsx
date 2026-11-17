import { useSearch } from "@tanstack/react-router";
import { ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const KNOWN_ERROR_CODES = ["ACCOUNT_NOT_APPROVED", "SIGN_IN_FAILED"] as const;

type LoginErrorCode = (typeof KNOWN_ERROR_CODES)[number];

const MODULE_KEYS = ["outletPopularity", "customerAffinity", "alsoOrdered"] as const;

const NODES = [
  { x: 60, y: 70 }, { x: 180, y: 40 }, { x: 300, y: 90 }, { x: 110, y: 170 },
  { x: 240, y: 190 }, { x: 360, y: 200 }, { x: 70, y: 280 }, { x: 200, y: 300 },
  { x: 330, y: 310 },
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 7], [5, 8], [6, 7], [7, 8], [2, 4],
];

function toLoginErrorCode(error: string): LoginErrorCode {
  return KNOWN_ERROR_CODES.includes(error as LoginErrorCode)
    ? (error as LoginErrorCode)
    : "SIGN_IN_FAILED";
}

function NetworkGraphic() {
  return (
    <svg viewBox="0 0 420 360" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="login-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.75 0.17 250)" />
          <stop offset="100%" stopColor="oklch(0.7 0.22 300)" />
        </linearGradient>
        <radialGradient id="login-node">
          <stop offset="0%" stopColor="oklch(0.95 0.05 250)" />
          <stop offset="100%" stopColor="oklch(0.7 0.18 260 / 0)" />
        </radialGradient>
      </defs>
      {EDGES.map(([from, to]) => (
        <line
          key={`${from}-${to}`}
          x1={NODES[from].x}
          y1={NODES[from].y}
          x2={NODES[to].x}
          y2={NODES[to].y}
          stroke="url(#login-edge)"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          strokeDasharray="4 8"
          className="motion-safe:animate-[login-flow_3s_linear_infinite]"
        />
      ))}
      {NODES.map((node, index) => (
        <g key={index}>
          <circle
            cx={node.x}
            cy={node.y}
            r="14"
            fill="url(#login-node)"
            className="motion-safe:animate-pulse"
            style={{ animationDelay: `${index * 0.35}s` }}
          />
          <circle cx={node.x} cy={node.y} r="3" fill="oklch(0.97 0.02 250)" />
        </g>
      ))}
    </svg>
  );
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

function HeroPanel() {
  const { t } = useTranslation("auth");

  return (
    <section className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-[oklch(0.16_0.03_265)] p-8 text-white lg:min-h-svh lg:p-12">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(oklch(1_0_0/4%)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0/4%)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-[oklch(0.6_0.2_260/35%)] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full bg-[oklch(0.6_0.22_300/30%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-8 top-20 bottom-72 hidden opacity-80 lg:block">
        <NetworkGraphic />
      </div>

      <div className="relative flex items-center gap-2 text-sm font-medium tracking-wide text-white/80">
        <SparklesIcon className="size-4 text-[oklch(0.8_0.15_250)]" />
        {t("hero.eyebrow")}
      </div>

      <div className="relative mt-10 max-w-md space-y-4 lg:mt-0">
        <h2 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
          {t("hero.title")}
        </h2>
        <p className="text-white/70">{t("hero.body")}</p>
        <ul className="flex flex-wrap gap-2 pt-2">
          {MODULE_KEYS.map((key) => (
            <li
              key={key}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/85 backdrop-blur"
            >
              <span className="size-1.5 rounded-full bg-[oklch(0.8_0.17_160)] shadow-[0_0_8px_oklch(0.8_0.17_160)]" />
              {t(`hero.modules.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SignInPanel() {
  const { t } = useTranslation("auth");
  const { error, returnTo } = useSearch({ from: "/login" });
  const loginHref = `/api/auth/login/google?returnTo=${encodeURIComponent(returnTo ?? "/")}`;

  return (
    <section className="relative flex items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative grid w-full max-w-sm gap-6 rounded-2xl border bg-card/70 p-8 shadow-panel backdrop-blur-xl">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("signInTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("signInSubtitle")}</p>
        </div>
        {error !== undefined && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-4 shrink-0" />
          {t("accessNote")}
        </p>
      </div>
    </section>
  );
}

export function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <HeroPanel />
      <SignInPanel />
    </main>
  );
}
