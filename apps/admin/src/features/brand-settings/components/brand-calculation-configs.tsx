import { useTranslation } from "react-i18next";
import { Tabs as TabsPrimitive } from "radix-ui";
import { CustomerItemScoresConfigSection } from "@/features/customer-item-scores-config/components/customer-item-scores-config-section";
import { ItemAffinityConfigSection } from "@/features/item-affinity-config/components/item-affinity-config-section";
import { OutletItemScoresConfigSection } from "@/features/outlet-item-scores-config/components/outlet-item-scores-config-section";
import { SettingsTabPanel } from "./settings-tab-panel";

const CALCULATIONS = [
  {
    value: "popularItems",
    titleKey: "outletItemScoresConfig.title",
    Section: OutletItemScoresConfigSection,
  },
  {
    value: "customerItems",
    titleKey: "customerItemScoresConfig.title",
    Section: CustomerItemScoresConfigSection,
  },
  {
    value: "itemAffinity",
    titleKey: "itemAffinityConfig.title",
    Section: ItemAffinityConfigSection,
  },
] as const;

type BrandCalculationConfigsProps = {
  brandId: string;
  readOnly: boolean;
};

// Uses the Radix primitive because ui/tabs styles triggers by the nearest group/tabs,
// which would also match the horizontal tabs this is nested in.
// gap-6 absorbs the -mx-6 overhang of each section's scroll body so it can't cover the nav.
export function BrandCalculationConfigs({ brandId, readOnly }: BrandCalculationConfigsProps) {
  const { t } = useTranslation("brands");

  return (
    <TabsPrimitive.Root
      orientation="vertical"
      defaultValue={CALCULATIONS[0].value}
      className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:gap-6"
    >
      <TabsPrimitive.List className="flex shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] sm:w-44 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:[scrollbar-width:auto]">
        {CALCULATIONS.map(({ value, titleKey }) => (
          <TabsPrimitive.Trigger
            key={value}
            value={value}
            className="shrink-0 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=active]:bg-muted data-[state=active]:text-foreground sm:whitespace-normal"
          >
            {t(titleKey)}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {CALCULATIONS.map(({ value, Section }) => (
        <SettingsTabPanel key={value} value={value}>
          <Section brandId={brandId} readOnly={readOnly} />
        </SettingsTabPanel>
      ))}
    </TabsPrimitive.Root>
  );
}
