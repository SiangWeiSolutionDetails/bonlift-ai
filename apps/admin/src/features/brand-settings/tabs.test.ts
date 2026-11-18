import type { BrandAction } from "@bonlift-ai/contracts";
import { describe, expect, it } from "vitest";
import {
  canEditSettingsTab,
  resolveSettingsTab,
  SETTINGS_TABS,
  validateSettingsSearch,
  visibleSettingsTabs,
} from "./tabs";

const granted = (...actions: BrandAction[]) => (action: BrandAction) => actions.includes(action);
const values = (tabs: readonly { value: string }[]) => tabs.map((tab) => tab.value);

describe("visibleSettingsTabs", () => {
  it("shows every tab in order when the user can view everything", () => {
    const can = granted("dataSource.view", "configs.view", "calculations.view", "channels.view");
    expect(values(visibleSettingsTabs(can))).toEqual(values(SETTINGS_TABS));
  });

  it("shows only general and the tabs whose view action is held", () => {
    expect(values(visibleSettingsTabs(granted("channels.view")))).toEqual(["general", "channels"]);
  });

  it("shows both config tabs with configs.view", () => {
    expect(values(visibleSettingsTabs(granted("configs.view")))).toEqual([
      "general",
      "calculation-configs",
      "serving-config",
    ]);
  });

  it("does not show a tab for its edit action alone", () => {
    expect(values(visibleSettingsTabs(granted("dataSource.edit")))).toEqual(["general"]);
  });
});

describe("canEditSettingsTab", () => {
  const tab = (value: string) => SETTINGS_TABS.find((t) => t.value === value)!;

  it("never edits general", () => {
    expect(canEditSettingsTab(tab("general"), () => true)).toBe(false);
  });

  it("edits the schedule with calculations.editSchedule only", () => {
    expect(canEditSettingsTab(tab("schedule"), granted("calculations.view"))).toBe(false);
    expect(canEditSettingsTab(tab("schedule"), granted("calculations.editSchedule"))).toBe(true);
  });

  it("edits channels with channels.edit", () => {
    expect(canEditSettingsTab(tab("channels"), granted("channels.edit"))).toBe(true);
  });
});

describe("resolveSettingsTab", () => {
  const visible = visibleSettingsTabs(granted("dataSource.view", "channels.view"));

  it("keeps a visible tab", () => {
    expect(resolveSettingsTab("channels", visible)).toBe("channels");
  });

  it("falls back to the first visible tab when none is asked for", () => {
    expect(resolveSettingsTab(undefined, visible)).toBe("general");
  });

  it("falls back for an unknown tab", () => {
    expect(resolveSettingsTab("nope", visible)).toBe("general");
  });

  it("falls back for a tab the user cannot see", () => {
    expect(resolveSettingsTab("schedule", visible)).toBe("general");
  });
});

describe("validateSettingsSearch", () => {
  it("keeps a string tab", () => {
    expect(validateSettingsSearch({ tab: "channels" })).toEqual({ tab: "channels" });
  });

  it("drops anything that is not a string", () => {
    expect(validateSettingsSearch({ tab: 3 })).toEqual({ tab: undefined });
    expect(validateSettingsSearch({})).toEqual({ tab: undefined });
  });
});
