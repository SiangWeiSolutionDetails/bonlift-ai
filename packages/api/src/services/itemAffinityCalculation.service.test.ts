import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import { startItemAffinityCalculation } from "./itemAffinityCalculation.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const QUERY = { from: "20260101", to: "20260201" };
const TRIGGER = { type: "manual", by: "api" } as const;

const queryMock = vi.fn();
const queueMock = vi.fn();
const fakePool = { query: queryMock } as any;

function start(query = QUERY) {
  return startItemAffinityCalculation(
    fakePool,
    queueMock,
    BRAND_ID,
    query,
    TRIGGER,
  );
}

beforeEach(() => {
  queryMock.mockReset();
  queueMock.mockReset();
});

describe("startItemAffinityCalculation", () => {
  it("throws ValidationError without querying when from is later than to", async () => {
    await expect(start({ from: "20260202", to: "20260201" })).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(start()).rejects.toThrow(NotFoundError);
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the brand is inactive", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ is_active: false, run_id: null }]),
    );

    await expect(start()).rejects.toThrow(ValidationError);
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("throws ConflictError when a run for the brand is already running", async () => {
    queryMock.mockRejectedValueOnce({
      code: UNIQUE_VIOLATION,
      constraint: "computation_runs_one_running_brand_key",
    });

    await expect(start()).rejects.toThrow(ConflictError);
  });

  it("marks the run failed and throws ServiceUnavailableError when queueing fails", async () => {
    queryMock
      .mockResolvedValueOnce(pgResult([{ is_active: true, run_id: RUN_ID }]))
      .mockResolvedValueOnce(pgResult([]));
    queueMock.mockRejectedValueOnce(new Error("redis down"));

    await expect(start()).rejects.toThrow(ServiceUnavailableError);
    expect(queryMock).toHaveBeenLastCalledWith(
      expect.stringContaining("status = 'failed'"),
      [RUN_ID],
    );
  });

  it("creates a brand-level run and queues it", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ is_active: true, run_id: RUN_ID }]),
    );

    const result = await start();

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("'item_affinity'"),
      expect.arrayContaining([BRAND_ID, "20260101", "20260201"]),
    );
    expect(queueMock).toHaveBeenCalledWith(RUN_ID);
    expect(result).toStrictEqual({
      runId: RUN_ID,
      brandId: BRAND_ID,
      jobType: "item_affinity",
      ...QUERY,
    });
  });
});
