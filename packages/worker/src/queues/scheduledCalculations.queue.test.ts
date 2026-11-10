import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const waitUntilReadyMock = vi.fn();
const upsertJobSchedulerMock = vi.fn();
const removeJobSchedulerMock = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class {
    on() {
      return this;
    }
    waitUntilReady = waitUntilReadyMock;
    upsertJobScheduler = upsertJobSchedulerMock;
    removeJobScheduler = removeJobSchedulerMock;
  },
}));

vi.mock("../connection.js", () => ({
  getRedisConnection: () => ({}),
  getSchedulerRedisConnection: () => ({}),
}));

const { syncBrandCalculationSchedule, removeBrandCalculationSchedule, toDailyCron } = await import(
  "./scheduledCalculations.queue.js"
);

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const TIMING = { isEnabled: true, runTime: "03:05", timeZone: "Asia/Singapore" };
const never = () => new Promise<never>(() => undefined);

beforeEach(() => {
  waitUntilReadyMock.mockReset().mockResolvedValue(undefined);
  upsertJobSchedulerMock.mockReset().mockResolvedValue(undefined);
  removeJobSchedulerMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toDailyCron", () => {
  it.each([
    ["03:00", "0 3 * * *"],
    ["00:00", "0 0 * * *"],
    ["23:59", "59 23 * * *"],
    ["07:05", "5 7 * * *"],
    ["07:05:30", "5 7 * * *"],
  ])("turns %s into %s", (runTime, cron) => {
    expect(toDailyCron(runTime)).toBe(cron);
  });
});

describe("syncBrandCalculationSchedule", () => {
  it("upserts the brand's daily scheduler with its timing on the job", async () => {
    await syncBrandCalculationSchedule(BRAND_ID, TIMING);

    expect(upsertJobSchedulerMock).toHaveBeenCalledWith(
      `calculation-schedule:${BRAND_ID}`,
      { pattern: "5 3 * * *", tz: "Asia/Singapore" },
      expect.objectContaining({
        data: { brandId: BRAND_ID, runTime: "03:05", timeZone: "Asia/Singapore" },
      }),
    );
  });

  it("removes the scheduler when the schedule is off", async () => {
    await syncBrandCalculationSchedule(BRAND_ID, { ...TIMING, isEnabled: false });

    expect(removeJobSchedulerMock).toHaveBeenCalledWith(`calculation-schedule:${BRAND_ID}`);
    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
  });

  it("fails after 5 s without sending the write when Redis never becomes ready", async () => {
    vi.useFakeTimers();
    waitUntilReadyMock.mockImplementation(never);

    const sync = syncBrandCalculationSchedule(BRAND_ID, TIMING);
    const failed = expect(sync).rejects.toThrow("Redis did not answer within 5000 ms");
    await vi.advanceTimersByTimeAsync(5_000);

    await failed;
    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
  });

  it("fails after 5 s when the write itself never answers", async () => {
    vi.useFakeTimers();
    removeJobSchedulerMock.mockImplementation(never);

    const remove = removeBrandCalculationSchedule(BRAND_ID);
    const failed = expect(remove).rejects.toThrow("Redis did not answer within 5000 ms");
    await vi.advanceTimersByTimeAsync(5_000);

    await failed;
  });
});
