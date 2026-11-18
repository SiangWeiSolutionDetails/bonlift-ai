import { describe, expect, it } from "vitest";
import { isProviderAvailable, providerButtonState } from "./providers";

const bothOn = { google: true, microsoft: true };
const googleOnly = { google: true, microsoft: false };

describe("isProviderAvailable", () => {
  it("is true only for a provider the backend reports as configured", () => {
    expect(isProviderAvailable(googleOnly, "google")).toBe(true);
    expect(isProviderAvailable(googleOnly, "microsoft")).toBe(false);
  });

  it("treats unknown providers config as unavailable", () => {
    expect(isProviderAvailable(undefined, "google")).toBe(false);
  });
});

describe("providerButtonState", () => {
  it("is loading while the providers request is pending", () => {
    expect(providerButtonState({ status: "pending" }, "google")).toBe("loading");
  });

  it("is an error when the providers request failed, even with stale data", () => {
    expect(providerButtonState({ status: "error", data: bothOn }, "google")).toBe("error");
  });

  it("is enabled for a configured provider", () => {
    expect(providerButtonState({ status: "success", data: googleOnly }, "google")).toBe("enabled");
  });

  it("is unavailable for a provider that isn't configured", () => {
    expect(providerButtonState({ status: "success", data: googleOnly }, "microsoft")).toBe("unavailable");
  });
});
