import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { updateBrandCalculationSchedule } from "./brandCalculationSchedule.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const UPDATED_AT = new Date("2026-11-06T00:00:00.000Z");

const SCHEDULE_ROW = {
  brand_id: BRAND_ID,
  is_enabled: true,
  run_time: "04:15",
  time_zone: "Asia/Singapore",
  outlet_window_days: 28,
  customer_window_days: 90,
  affinity_window_days: 90,
  updated_by: "api",
  updated_at: UPDATED_AT,
  next_run_at: new Date("2026-11-06T20:15:00.000Z"),
  last_run_at: null,
  last_queued: null,
  last_failed_to_queue: null,
  last_error: null,
};

const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const fakePool = {
  connect: async () => ({ query: clientQueryMock, release: releaseMock }),
} as any;
const syncMock = vi.fn();

// BEGIN, the update (which returns the record), then COMMIT or ROLLBACK
function answerQueries(updateRow: { found: boolean; updated: boolean }) {
  const row = updateRow.updated
    ? { found: true, ...SCHEDULE_ROW }
    : { found: updateRow.found, ...Object.fromEntries(Object.keys(SCHEDULE_ROW).map((key) => [key, null])) };
  clientQueryMock.mockImplementation(async (sql: string) =>
    sql.includes("current_schedule") ? pgResult([row]) : pgResult([]),
  );
}

function statements(): string[] {
  return clientQueryMock.mock.calls.map(([sql]) => sql as string);
}

function update(data: any = { runTime: "04:15" }) {
  return updateBrandCalculationSchedule(fakePool, syncMock, BRAND_ID, data, "api");
}

beforeEach(() => {
  clientQueryMock.mockReset();
  releaseMock.mockReset();
  syncMock.mockReset();
});

describe("updateBrandCalculationSchedule", () => {
  it("syncs the saved timing before committing", async () => {
    answerQueries({ found: true, updated: true });
    syncMock.mockResolvedValueOnce(undefined);

    const schedule = await update();

    expect(schedule).toMatchObject({ runTime: "04:15", nextRunAt: "2026-11-06T20:15:00.000Z" });
    expect(syncMock).toHaveBeenCalledWith(BRAND_ID, {
      isEnabled: true,
      runTime: "04:15",
      timeZone: "Asia/Singapore",
    });
    expect(statements()).toContain("COMMIT");
    expect(statements()).not.toContain("ROLLBACK");
  });

  it("rolls back and returns 503 when the scheduler cannot be synced", async () => {
    answerQueries({ found: true, updated: true });
    syncMock.mockRejectedValueOnce(new Error("Redis is down"));

    await expect(update()).rejects.toThrow(ServiceUnavailableError);

    expect(statements()).toContain("ROLLBACK");
    expect(statements()).not.toContain("COMMIT");
    expect(releaseMock).toHaveBeenCalled();
  });

  it("returns 400 without syncing when Postgres does not know the time zone", async () => {
    answerQueries({ found: true, updated: false });

    await expect(update({ timeZone: "Asia/Singapore" })).rejects.toThrow(ValidationError);

    expect(syncMock).not.toHaveBeenCalled();
    expect(statements()).toContain("ROLLBACK");
  });

  it("saves and syncs in a single statement between BEGIN and COMMIT", async () => {
    answerQueries({ found: true, updated: true });
    syncMock.mockResolvedValueOnce(undefined);

    await update();

    expect(statements().map((sql) => (sql.includes("current_schedule") ? "UPDATE" : sql.trim()))).toEqual([
      "BEGIN",
      "UPDATE",
      "COMMIT",
    ]);
  });

  it.each(["localtime", "Factory", "posixrules", "Mars/Olympus"])(
    "returns 400 without querying for %s, a zone the scheduler cannot use",
    async (timeZone) => {
      await expect(update({ timeZone })).rejects.toThrow(ValidationError);

      expect(clientQueryMock).not.toHaveBeenCalled();
      expect(syncMock).not.toHaveBeenCalled();
    },
  );

  it("returns 404 without syncing for an unknown brand", async () => {
    answerQueries({ found: false, updated: false });

    await expect(update()).rejects.toThrow(NotFoundError);

    expect(syncMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty body", {}],
    ["a run time outside 00:00–23:59", { runTime: "24:00" }],
    ["a window of 0 days", { outletWindowDays: 0 }],
    ["a window over 366 days", { affinityWindowDays: 367 }],
    ["an unknown field", { cron: "0 3 * * *" }],
  ])("throws ValidationError without querying for %s", async (_name, data) => {
    await expect(update(data)).rejects.toThrow(ValidationError);

    expect(clientQueryMock).not.toHaveBeenCalled();
  });
});
