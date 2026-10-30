import type { ComponentType, ReactNode } from "react";
import { cn } from "cn";

type SectionCardProps = {
  title: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "primary";
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function SectionCard({
  title,
  icon: Icon,
  tone = "default",
  action,
  className,
  children,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "grid min-w-0 content-start gap-6 rounded-2xl border p-5 text-card-foreground",
        tone === "primary"
          ? "border-primary/20 bg-primary/10"
          : "bg-card shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Icon className="size-4" />
            </span>
          )}
          <h3 className="font-heading text-base font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
