import { describe, expect, it } from "vitest";
import { isOtherBrandOutletRun, isOtherBrandRun, isRunUnavailable } from "./run-scope";

const BRAND = "00000000-0000-4000-8000-00000000000a";
const OTHER_BRAND = "00000000-0000-4000-8000-00000000000b";
const OUTLET = "00000000-0000-4000-8000-000000000001";
const OTHER_OUTLET = "00000000-0000-4000-8000-000000000002";

describe("isOtherBrandRun", () => {
  it("flags a loaded run of another brand", () => {
    expect(isOtherBrandRun({ brandId: OTHER_BRAND }, BRAND)).toBe(true);
  });

  it("keeps a run of the workspace brand", () => {
    expect(isOtherBrandRun({ brandId: BRAND }, BRAND)).toBe(false);
  });

  it("does not decide before the run has loaded", () => {
    expect(isOtherBrandRun(undefined, BRAND)).toBe(false);
  });
});

describe("isOtherBrandOutletRun", () => {
  it("flags a loaded run of an outlet outside the brand", () => {
    expect(isOtherBrandOutletRun({ outletId: OTHER_OUTLET }, [OUTLET])).toBe(true);
  });

  it("keeps a run of any of the brand's outlets", () => {
    expect(isOtherBrandOutletRun({ outletId: OUTLET }, [OTHER_OUTLET, OUTLET])).toBe(false);
  });

  it("does not decide before the run or the brand's outlets have loaded", () => {
    expect(isOtherBrandOutletRun(undefined, [OUTLET])).toBe(false);
    expect(isOtherBrandOutletRun({ outletId: OTHER_OUTLET }, undefined)).toBe(false);
  });
});

describe("isRunUnavailable", () => {
  it("flags a 403 or 404 error", () => {
    expect(isRunUnavailable({ status: 403 })).toBe(true);
    expect(isRunUnavailable({ status: 404 })).toBe(true);
  });

  it("ignores other errors and no error", () => {
    expect(isRunUnavailable({ status: 500 })).toBe(false);
    expect(isRunUnavailable(new Error("network"))).toBe(false);
    expect(isRunUnavailable(null)).toBe(false);
  });
});
