import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BrandAction } from "@bonlift-ai/contracts";
import { usePermissions } from "@/features/auth/permissions";
import { BrandCalculationScheduleSection } from "@/features/brand-calculation-schedule/components/brand-calculation-schedule-section";
import { BrandChannelsSection } from "@/features/brand-channels/components/brand-channels-section";
import { BrandDataSourceSection } from "@/features/brand-data-source/components/brand-data-source-section";
import { BrandCalculationConfigs } from "@/features/brand-settings/components/brand-calculation-configs";
import { BrandGeneralSection } from "@/features/brand-settings/components/brand-general-section";
import { SettingsTabPanel } from "@/features/brand-settings/components/settings-tab-panel";
import {
  canEditSettingsTab,
  resolveSettingsTab,
  visibleSettingsTabs,
  type SettingsTabValue,
} from "@/features/brand-settings/tabs";
import { ServingConfigSection } from "@/features/serving-config/components/serving-config-section";
import { useWorkspaceBrandId } from "@/features/workspaces/use-workspace";

const routeApi = getRouteApi("/_app/b/$brandId/settings");

type SectionProps = { brandId: string; readOnly: boolean };

const TABS = {
  general: { labelKey: "brands:tabs.general", Section: BrandGeneralSection },
  "data-source": { labelKey: "brands:dataSource.title", Section: BrandDataSourceSection },
  "calculation-configs": { labelKey: "brands:tabs.calculationConfigs", Section: BrandCalculationConfigs },
  "serving-config": { labelKey: "servingConfig:title", Section: ServingConfigSection },
  schedule: { labelKey: "brands:tabs.schedule", Section: BrandCalculationScheduleSection },
  channels: { labelKey: "brands:tabs.channels", Section: BrandChannelsSection },
} as const satisfies Record<SettingsTabValue, { labelKey: string; Section: ComponentType<SectionProps> }>;

export function BrandSettingsPage() {
  const { t } = useTranslation(["common", "brands", "servingConfig"]);
  const brandId = useWorkspaceBrandId();
  const { canBrand } = usePermissions();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const can = (action: BrandAction) => canBrand(brandId, action);
  const tabs = visibleSettingsTabs(can);
  const activeTab = resolveSettingsTab(search.tab, tabs);

  // replace: switching tabs should not fill the back button history
  function openTab(tab: string) {
    navigate({ search: { tab }, replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.settings")} />
      <Tabs value={activeTab} onValueChange={openTab} className="gap-4">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none">
              {t(TABS[tab.value].labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => {
          const { Section } = TABS[tab.value];
          return (
            <SettingsTabPanel key={tab.value} value={tab.value}>
              {/* p-6 matches the -mx-6 overhang each section's scroll body was built for in the dialog */}
              <div className="flex min-h-0 flex-col rounded-xl bg-card p-6 shadow-panel">
                <Section brandId={brandId} readOnly={!canEditSettingsTab(tab, can)} />
              </div>
            </SettingsTabPanel>
          );
        })}
      </Tabs>
    </div>
  );
}
