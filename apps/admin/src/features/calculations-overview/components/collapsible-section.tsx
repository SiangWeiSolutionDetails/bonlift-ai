import { useId, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type CollapsibleSectionProps = {
  title: ReactNode;
  // Always visible, also when collapsed: keep it to what needs a glance.
  // Links in it need `pointer-events-auto relative` to sit above the trigger.
  summary: ReactNode;
  // Right-most in the header
  action?: ReactNode;
  children: ReactNode;
};

// The trigger is an empty layer behind the header instead of wrapping it, so the summary can hold links
export function CollapsibleSection({ title, summary, action, children }: CollapsibleSectionProps) {
  const titleId = useId();

  return (
    <Collapsible asChild>
      <section className="group/section min-w-0 overflow-hidden rounded-xl border bg-card shadow-panel">
        <div className="relative bg-muted/40 transition-colors hover:bg-muted/70">
          <CollapsibleTrigger
            aria-labelledby={titleId}
            className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
          <div className="pointer-events-none relative flex items-start gap-3 p-5">
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" />
            <div className="grid min-w-0 flex-1 gap-3">
              <h3 id={titleId} className="font-heading text-base font-semibold">
                {title}
              </h3>
              {summary}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </div>
        <CollapsibleContent className="grid gap-5 border-t p-5 pl-12">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
