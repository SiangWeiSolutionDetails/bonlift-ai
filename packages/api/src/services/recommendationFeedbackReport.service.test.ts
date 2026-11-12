import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import {
  getRecommendationFeedbackReport,
  listRecommendationServes,
} from "./recommendationFeedbackReport.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "22222222-2222-2222-2222-222222222222";
const CHANNEL_ID = "33333333-3333-3333-3333-333333333333";
const SERVE_ID = "44444444-4444-4444-4444-444444444444";
const RUN_ID = "66666666-6666-6666-6666-666666666666";
const CUSTOMER_RUN_ID = "77777777-7777-7777-7777-777777777777";
const QUERY = { from: "2026-11-01", to: "2026-11-03", tz: "Asia/Singapore" };

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function groupedRow(groupingSet: number, key: string | null, overrides: Record<string, unknown> = {}) {
  return {
    grouping_set: groupingSet,
    key,
    outlet_name: null,
    accepted: 3,
    rejected: 1,
    ...overrides,
  };
}

function reportRows() {
  return [
    groupedRow(0b01111, "2026-11-02"),
    groupedRow(0b10111, "ITEM-1"),
    groupedRow(0b11011, OUTLET_ID, { outlet_name: "Boat Quay" }),
    groupedRow(0b11101, "popular_at_outlet"),
    groupedRow(0b11110, "lunch"),
    groupedRow(0b11111, null),
  ];
}

function serveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVE_ID,
    served_at: new Date("2026-11-02T03:04:05.123Z"),
    cursor_at: "2026-11-02T03:04:05.123456Z",
    outlet_id: OUTLET_ID,
    outlet_name: "Boat Quay",
    channel_code: "tqr",
    daypart: "lunch",
    items: [{ itemId: "ITEM-1", rank: 1, reason: "popular_at_outlet", outcome: "accepted" }],
    run_id: RUN_ID,
    run_available: true,
    customer_run_id: CUSTOMER_RUN_ID,
    customer_run_available: false,
    affinity_run_id: null,
    affinity_run_available: false,
    ...overrides,
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getRecommendationFeedbackReport", () => {
  describe("validation (never reaches the database)", () => {
    it("throws ValidationError for an invalid brand id", async () => {
      await expect(getRecommendationFeedbackReport(fakePool, "invalid-id", QUERY)).rejects.toThrow(
        ValidationError,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError for an unknown time zone", async () => {
      await expect(
        getRecommendationFeedbackReport(fakePool, BRAND_ID, { ...QUERY, tz: "Mars/Olympus" }),
      ).rejects.toThrow("Mars/Olympus is not a valid time zone.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when from is after to", async () => {
      await expect(
        getRecommendationFeedbackReport(fakePool, BRAND_ID, { ...QUERY, from: "2026-11-04" }),
      ).rejects.toThrow("from must not be after to.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError for a range longer than 366 days", async () => {
      await expect(
        getRecommendationFeedbackReport(fakePool, BRAND_ID, { ...QUERY, from: "2025-01-01", to: "2026-01-02" }),
      ).rejects.toThrow("The range must not be longer than 366 days.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError for an invalid outlet filter", async () => {
      await expect(
        getRecommendationFeedbackReport(fakePool, BRAND_ID, { ...QUERY, outletId: "nope" }),
      ).rejects.toThrow(ValidationError);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  it("passes the brand, range, time zone and NULL for every missing filter", async () => {
    queryMock.mockResolvedValueOnce(pgResult(reportRows()));

    await getRecommendationFeedbackReport(fakePool, BRAND_ID, QUERY);

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      BRAND_ID,
      "2026-11-01",
      "2026-11-03",
      "Asia/Singapore",
      null,
      null,
      null,
      null,
    ]);
  });

  it("passes the outlet, daypart, reason and channel filters", async () => {
    queryMock.mockResolvedValueOnce(pgResult(reportRows()));

    await getRecommendationFeedbackReport(fakePool, BRAND_ID, {
      ...QUERY,
      outletId: OUTLET_ID,
      daypart: "lunch",
      reason: "popular_at_outlet",
      channelId: CHANNEL_ID,
    });

    expect(queryMock.mock.calls[0][1].slice(4)).toEqual([OUTLET_ID, "lunch", "popular_at_outlet", CHANNEL_ID]);
  });

  it("aggregates once with grouping sets, scoped to the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult(reportRows()));

    await getRecommendationFeedbackReport(fakePool, BRAND_ID, QUERY);

    const sql: string = queryMock.mock.calls[0][0];
    expect(sql).toContain("GROUPING SETS ((), (day), (item_id), (outlet_id), (reason), (daypart))");
    expect(sql).toContain("s.brand_id = bounds.brand_id");
  });

  it("splits the grouping sets into summary, zero-filled days and breakdowns", async () => {
    queryMock.mockResolvedValueOnce(pgResult(reportRows()));

    const counts = { accepted: 3, rejected: 1 };
    const zero = { accepted: 0, rejected: 0 };
    expect(await getRecommendationFeedbackReport(fakePool, BRAND_ID, QUERY)).toStrictEqual({
      brandId: BRAND_ID,
      ...QUERY,
      summary: counts,
      days: [
        { date: "2026-11-01", ...zero },
        { date: "2026-11-02", ...counts },
        { date: "2026-11-03", ...zero },
      ],
      byItem: [{ key: "ITEM-1", label: "ITEM-1", ...counts }],
      byOutlet: [{ key: OUTLET_ID, label: "Boat Quay", ...counts }],
      byReason: [{ key: "popular_at_outlet", label: "popular_at_outlet", ...counts }],
      byDaypart: [{ key: "lunch", label: "lunch", ...counts }],
    });
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getRecommendationFeedbackReport(fakePool, BRAND_ID, QUERY)).rejects.toThrow(NotFoundError);
  });
});

describe("listRecommendationServes", () => {
  describe("validation (never reaches the database)", () => {
    it("throws ValidationError for a limit above 100", async () => {
      await expect(listRecommendationServes(fakePool, BRAND_ID, { ...QUERY, limit: 101 })).rejects.toThrow(
        ValidationError,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it.each([
      ["not base64 json", "%%%"],
      ["a cursor without an id", encode({ servedAt: "2026-11-02T03:04:05.123456Z" })],
      ["a cursor with an impossible time", encode({ servedAt: "2026-02-30T03:04:05.123456Z", id: SERVE_ID })],
      ["a cursor with a bad id", encode({ servedAt: "2026-11-02T03:04:05.123456Z", id: "x" })],
      ["a JSON value that is not an object", encode(null)],
    ])("throws ValidationError for %s", async (_name, before) => {
      await expect(listRecommendationServes(fakePool, BRAND_ID, { ...QUERY, before })).rejects.toThrow(
        "before is not a valid cursor.",
      );
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  it("fetches one more than the default limit of 50 for the first page", async () => {
    queryMock.mockResolvedValueOnce(pgResult([serveRow()]));

    await listRecommendationServes(fakePool, BRAND_ID, QUERY);

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      BRAND_ID,
      "2026-11-01",
      "2026-11-03",
      "Asia/Singapore",
      null,
      null,
      null,
      null,
      null,
      null,
      51,
    ]);
  });

  it("passes the decoded cursor", async () => {
    queryMock.mockResolvedValueOnce(pgResult([serveRow()]));
    const before = encode({ servedAt: "2026-11-02T03:04:05.123456Z", id: SERVE_ID });

    await listRecommendationServes(fakePool, BRAND_ID, { ...QUERY, limit: 10, before });

    expect(queryMock.mock.calls[0][1].slice(8)).toEqual(["2026-11-02T03:04:05.123456Z", SERVE_ID, 11]);
  });

  it("maps a serve and returns no cursor when nothing is left", async () => {
    queryMock.mockResolvedValueOnce(pgResult([serveRow()]));

    expect(await listRecommendationServes(fakePool, BRAND_ID, QUERY)).toStrictEqual({
      serves: [
        {
          id: SERVE_ID,
          servedAt: "2026-11-02T03:04:05.123Z",
          outletId: OUTLET_ID,
          outletName: "Boat Quay",
          channelCode: "tqr",
          daypart: "lunch",
          items: [
            { itemId: "ITEM-1", label: "ITEM-1", rank: 1, reason: "popular_at_outlet", outcome: "accepted" },
          ],
          runs: {
            outletScores: { runId: RUN_ID, available: true },
            customerScores: { runId: CUSTOMER_RUN_ID, available: false },
            itemAffinity: null,
          },
        },
      ],
      nextCursor: null,
    });
  });

  it("reports every run as null when the serve used none", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([serveRow({ run_id: null, run_available: false, customer_run_id: null })]),
    );

    const page = await listRecommendationServes(fakePool, BRAND_ID, QUERY);

    expect(page.serves[0].runs).toStrictEqual({ outletScores: null, customerScores: null, itemAffinity: null });
  });

  it("drops the extra row and points the cursor at the last returned serve", async () => {
    const lastId = "55555555-5555-5555-5555-555555555555";
    queryMock.mockResolvedValueOnce(
      pgResult([serveRow(), serveRow({ id: lastId, cursor_at: "2026-11-01T00:00:00.000001Z" }), serveRow()]),
    );

    const page = await listRecommendationServes(fakePool, BRAND_ID, { ...QUERY, limit: 2 });

    expect(page.serves.map((serve) => serve.id)).toEqual([SERVE_ID, lastId]);
    expect(page.nextCursor).toBe(encode({ servedAt: "2026-11-01T00:00:00.000001Z", id: lastId }));
  });

  it("returns an empty page for a brand without serves", async () => {
    queryMock.mockResolvedValueOnce(pgResult([serveRow({ id: null })]));

    expect(await listRecommendationServes(fakePool, BRAND_ID, QUERY)).toStrictEqual({
      serves: [],
      nextCursor: null,
    });
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(listRecommendationServes(fakePool, BRAND_ID, QUERY)).rejects.toThrow(NotFoundError);
  });
});
