import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { getErrorMessage } from "./error-message";

// Echoes the key so assertions check which translation was picked, not its wording
const t = ((key: string) => `t:${key}`) as unknown as TFunction<"common">;

describe("getErrorMessage", () => {
  it("translates a known API error code", () => {
    const error = new ApiError(404, "NOT_FOUND", "Brand not found");
    expect(getErrorMessage(error, t)).toBe("t:errors.NOT_FOUND");
  });

  it("translates the client-side network error", () => {
    const error = new ApiError(0, "NETWORK_ERROR", "Unable to reach the server");
    expect(getErrorMessage(error, t)).toBe("t:errors.NETWORK_ERROR");
  });

  it("falls back to the server message for an unknown code", () => {
    const error = new ApiError(409, "BRAND_NAME_TAKEN", "Brand name already exists");
    expect(getErrorMessage(error, t)).toBe("Brand name already exists");
  });

  it("uses the generic message for non-API errors", () => {
    expect(getErrorMessage(new TypeError("x is undefined"), t)).toBe("t:errors.UNKNOWN");
  });
});
