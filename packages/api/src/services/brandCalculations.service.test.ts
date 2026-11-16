import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { startAllBrandCalculations } from "./brandCalculations.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "22222222-2222-2222-2222-222222222222";
const OUTLET_RUN = "33333333-3333-3333-3333-333333333333";
const BRAND_RUN = "44444444-4444-4444-4444-444444444444";
const TRIGGER = { type: "manual", by: "api" } as const;

const queryMock = vi.fn();
const queueMock = vi.fn();
const fakePool = { query: queryMock } as any;
const queues = {
  outlet_item_scores: queueMock,
  customer_item_scores: queueMock,
  item_affinity: queueMock,
};

function start(brandId = BRAND_ID, body = {}) {
  return startAllBrandCalculations(fakePool, queues, brandId, body, TRIGGER);
}

const CREATED_ROWS = [
  { is_active: true, id: OUTLET_RUN, job_type: "outlet_item_scores", outlet_id: OUTLET_ID },
  { is_active: true, id: BRAND_RUN, job_type: "item_affinity", outlet_id: null },
];

beforeEach(() => {
  queryMock.mockReset();
  queueMock.mockReset();
});

describe("startAllBrandCalculations", () => {
  it("throws ValidationError without querying for a malformed brand id", async () => {
    await expect(start("not-a-uuid")).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(start()).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when the brand is inactive", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ is_active: false, id: null, job_type: null, outlet_id: null }]));

    await expect(start()).rejects.toThrow(ValidationError);
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("returns an empty list when there is nothing to calculate", async () => {
    queryMock.mockResolvedValueOnce(pgResult([{ is_active: true, id: null, job_type: null, outlet_id: null }]));

    expect(await start()).toEqual({ brandId: BRAND_ID, runs: [], queued: 0, failedToQueue: 0 });
  });

  it("returns the started runs and counts a run that failed to queue", async () => {
    queryMock.mockResolvedValueOnce(pgResult(CREATED_ROWS)).mockResolvedValue(pgResult([]));
    queueMock.mockImplementation(async (runId: string) => {
      if (runId === BRAND_RUN) throw new Error("Redis is down");
    });

    expect(await start()).toEqual({
      brandId: BRAND_ID,
      runs: [
        { runId: OUTLET_RUN, jobType: "outlet_item_scores", outletId: OUTLET_ID },
        { runId: BRAND_RUN, jobType: "item_affinity", outletId: null },
      ],
      queued: 1,
      failedToQueue: 1,
    });
  });

  it("throws ServiceUnavailableError when no run could be queued", async () => {
    queryMock.mockResolvedValueOnce(pgResult(CREATED_ROWS)).mockResolvedValue(pgResult([]));
    queueMock.mockRejectedValue(new Error("Redis is down"));

    await expect(start()).rejects.toThrow(ServiceUnavailableError);
  });

  describe("windows", () => {
    const EMPTY_BRAND = [{ is_active: true, id: null, job_type: null, outlet_id: null }];

    it.each([
      ["from after to", { item_affinity: { from: "20261110", to: "20261101" } }],
      ["an impossible date", { outlet_item_scores: { from: "20260230", to: "20260301" } }],
      ["a malformed date", { customer_item_scores: { from: "2026-11-01", to: "20261110" } }],
      ["a missing bound", { item_affinity: { from: "20261101" } }],
      ["an unknown calculation", { unknown_job: { from: "20261101", to: "20261110" } }],
    ])("throws ValidationError without querying for %s", async (_label, windows) => {
      await expect(start(BRAND_ID, { windows } as any)).rejects.toThrow(ValidationError);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("passes each override to its own bounds and NULL for calculations left out", async () => {
      queryMock.mockResolvedValueOnce(pgResult(EMPTY_BRAND));

      await start(BRAND_ID, {
        windows: {
          outlet_item_scores: { from: "20261020", to: "20261110" },
          item_affinity: { from: "20261101", to: "20261101" },
        },
      });

      const params = queryMock.mock.calls[0][1];
      expect(params.slice(7)).toEqual(["20261020", "20261110", null, null, "20261101", "20261101"]);
    });

    it("passes NULL for every bound without a body", async () => {
      queryMock.mockResolvedValueOnce(pgResult(EMPTY_BRAND));

      await start();

      expect(queryMock.mock.calls[0][1].slice(7)).toEqual([null, null, null, null, null, null]);
    });
  });
});
