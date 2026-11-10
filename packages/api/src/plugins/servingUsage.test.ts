import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgResult } from "../utils/pg.test-helpers.js";
import { createServingUsageHook } from "./servingUsage.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const API_KEY_ID = "22222222-2222-2222-2222-222222222222";
const CHANNEL_ID = "33333333-3333-3333-3333-333333333333";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;
const errorLog = vi.fn();

function request(overrides: Record<string, unknown> = {}) {
  return {
    servingBrandId: BRAND_ID,
    servingApiKeyId: API_KEY_ID,
    servingChannel: { id: CHANNEL_ID, code: "tqr", isActive: true },
    routeOptions: { url: "/v1/recommendations" },
    log: { error: errorLog },
    ...overrides,
  } as any;
}

function reply(statusCode = 200, elapsedTime = 12.4) {
  return { statusCode, elapsedTime } as any;
}

const hook = createServingUsageHook(() => fakePool);

beforeEach(() => {
  queryMock.mockReset();
  errorLog.mockReset();
});

describe("createServingUsageHook", () => {
  it("records the brand, key, channel, route pattern, status and rounded duration", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await hook(request(), reply(503, 12.6));

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      BRAND_ID,
      API_KEY_ID,
      CHANNEL_ID,
      "/v1/recommendations",
      503,
      13,
    ]);
  });

  it("records an unmatched path as 'unmatched', never the raw URL", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await hook(request({ routeOptions: {}, url: "/v1/anything?x=1" }), reply(404));

    expect(queryMock.mock.calls[0][1][3]).toBe("unmatched");
  });

  it("records nothing for a call the API key hook rejected", async () => {
    await hook(request({ servingBrandId: null, servingApiKeyId: null }), reply(401));

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("logs a failed write instead of throwing", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));

    await expect(hook(request(), reply())).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Serving usage was not recorded",
    );
  });
});

describe("createServingUsageHook for a key without a channel", () => {
  it("records the call with no channel", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await hook(request({ servingChannel: null }), reply());

    expect(queryMock.mock.calls[0][1][2]).toBeNull();
  });
});
