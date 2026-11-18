import type { BrandAction } from "@bonlift-ai/contracts";

// General is read-only brand details, so it needs no action and is always there
export const SETTINGS_TABS = [
  { value: "general", view: null, edit: null },
  { value: "data-source", view: "dataSource.view", edit: "dataSource.edit" },
  { value: "calculation-configs", view: "configs.view", edit: "configs.edit" },
  { value: "serving-config", view: "configs.view", edit: "configs.edit" },
  { value: "schedule", view: "calculations.view", edit: "calculations.editSchedule" },
  { value: "channels", view: "channels.view", edit: "channels.edit" },
] as const satisfies readonly { value: string; view: BrandAction | null; edit: BrandAction | null }[];

export type SettingsTab = (typeof SETTINGS_TABS)[number];
export type SettingsTabValue = SettingsTab["value"];
export type SettingsSearch = { tab?: string };

type Can = (action: BrandAction) => boolean;

export function validateSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  return { tab: typeof search.tab === "string" ? search.tab : undefined };
}

export function visibleSettingsTabs(can: Can): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => tab.view === null || can(tab.view));
}

export function canEditSettingsTab(tab: SettingsTab, can: Can) {
  return tab.edit !== null && can(tab.edit);
}

// An unknown or hidden tab falls back to the first one the user can see
export function resolveSettingsTab(requested: string | undefined, visible: SettingsTab[]): SettingsTabValue {
  return visible.find((tab) => tab.value === requested)?.value ?? visible[0]?.value ?? "general";
}
