import type { ReactNode } from "react";
import { TabsContent } from "@/components/ui/tabs";

// Kept mounted while hidden, so unsaved edits survive switching tabs
export function SettingsTabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      forceMount
      className="flex min-h-0 min-w-0 flex-col data-[state=inactive]:hidden"
    >
      {children}
    </TabsContent>
  );
}
