import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type CollapsibleSectionProps = {
  title: ReactNode;
  // Always visible, also when collapsed: keep it to what needs a glance
  summary: ReactNode;
  children: ReactNode;
};

export function CollapsibleSection({ title, summary, children }: CollapsibleSectionProps) {
  return (
    <Collapsible asChild>
      <section className="group/section min-w-0 overflow-hidden rounded-xl border bg-card shadow-panel">
        <CollapsibleTrigger className="flex w-full cursor-pointer items-start gap-3 bg-muted/40 p-5 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" />
          <div className="grid min-w-0 flex-1 gap-3">
            <h3 className="font-heading text-base font-semibold">{title}</h3>
            {summary}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-5 border-t p-5 pl-12">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
