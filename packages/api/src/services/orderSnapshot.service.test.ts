import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatasetSchemaType } from "@bonlift-ai/contracts";
import { NotFoundError, ValidationError } from "../errors.js";
import { hashCustomerId } from "../utils/customerIdHash.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import {
  getOrderSnapshot,
  getOrderSnapshotCoverage,
  storeOrderSnapshots,
} from "./orderSnapshot.service.js";

const OUTLET_ID = "33333333-3333-3333-3333-333333333333";
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const INVALID_ID = "invalid-id";

type DatasetDay = DatasetSchemaType["dates"][number];
type DatasetOrder = DatasetDay["orders"][number];

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function order(overrides: Partial<DatasetOrder> = {}): DatasetOrder {
  return {
    orderId: "SAL-0001",
    orderedAt: "2026-06-26T12:00:00+08:00",
    orderTotal: 4.9,
    lines: [{ itemId: "PRD-1", itemName: "Iced Lime Juice", qty: 1, unitPrice: 4.9 }],
    ...overrides,
  };
}

function dataset(dates: DatasetDay[]): DatasetSchemaType {
  return { outletName: "BEDOK MALL", dates };
}

function storedRow(date: string, orderCount: number, status = "inserted") {
  return { is_active: true, date, order_count: orderCount, status };
}

function storeSnapshots(pool: any, outletId: string, data: DatasetSchemaType) {
  return storeOrderSnapshots(pool, outletId, data, SECRET);
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("storeOrderSnapshots", () => {
  describe("validation (never reaches the database)", () => {
    it("throws ValidationError when the outlet id is invalid", async () => {
      await expect(
        storeSnapshots(fakePool, INVALID_ID, dataset([{ date: "20260626", orders: [] }])),
      ).rejects.toThrow(ValidationError);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when there are no dates", async () => {
      await expect(storeSnapshots(fakePool, OUTLET_ID, dataset([]))).rejects.toThrow(
        ValidationError,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError for an impossible date", async () => {
      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260230", orders: [] }])),
      ).rejects.toThrow("20260230 is not a valid YYYYMMDD date.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when a date appears twice", async () => {
      const day = { date: "20260626", orders: [] };

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([day, { ...day }])),
      ).rejects.toThrow("20260626 appears more than once.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when an order belongs to another date", async () => {
      const day = {
        date: "20260626",
        orders: [order({ orderId: "SAL-0042", orderedAt: "2026-06-27T00:30:00+08:00" })],
      };

      await expect(storeSnapshots(fakePool, OUTLET_ID, dataset([day]))).rejects.toThrow(
        "20260626: order SAL-0042 was placed on 20260627.",
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

  });

  describe("accepted input", () => {
    it("judges an order by its local date, not its UTC date", async () => {
      // 07:30 local on the 26th is 23:30 UTC on the 25th; the local date is what counts.
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const day = { date: "20260626", orders: [order({ orderedAt: "2026-06-26T07:30:00+08:00" })] };

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([day])),
      ).resolves.toBeDefined();
    });

    it.each([
      ["the first second of the day", "2026-06-26T00:00:00+08:00"],
      ["the last second of the day", "2026-06-26T23:59:59+08:00"],
    ])("accepts an order at %s", async (_label, orderedAt) => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const day = { date: "20260626", orders: [order({ orderedAt })] };

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([day])),
      ).resolves.toBeDefined();
    });

    it("stores an order id that appears twice on the same date as sent", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 2)]));
      const days = [{ date: "20260626", orders: [order(), order()] }];

      await storeSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [, values] = queryMock.mock.calls[0];
      expect(JSON.parse(values[1])[0].orders).toHaveLength(2);
    });

    it("accepts the same order id on different dates", async () => {
      queryMock.mockResolvedValueOnce(
        pgResult([storedRow("20260626", 1), storedRow("20260627", 1)]),
      );
      const days = [
        { date: "20260626", orders: [order()] },
        { date: "20260627", orders: [order({ orderedAt: "2026-06-27T12:00:00+08:00" })] },
      ];

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset(days)),
      ).resolves.toBeDefined();
    });

    it("accepts a date with no orders", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 0)]));

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }])),
      ).resolves.toBeDefined();
    });
  });

  describe("storing", () => {
    it("sends the outlet id and the dates as one JSON parameter", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const days = [{ date: "20260626", orders: [order()] }];

      await storeSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [sql, values] = queryMock.mock.calls[0];
      expect(sql).toContain("INSERT INTO order_snapshots");
      // An order without a customerId is stored with an explicit null (anonymous).
      const stored = days.map((day) => ({ ...day, orders: day.orders.map((o) => ({ ...o, customerId: null })) }));
      expect(values).toStrictEqual([OUTLET_ID, JSON.stringify(stored)]);
    });

    it("strips unknown fields before storing", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const withExtras = {
        ...dataset([
          { date: "20260626", orders: [{ ...order(), unknownOrderField: "x" } as DatasetOrder] },
        ]),
        unknownRootField: "y",
      };

      await storeSnapshots(fakePool, OUTLET_ID, withExtras);

      const [, values] = queryMock.mock.calls[0];
      expect(values[1]).not.toContain("unknownOrderField");
    });

    it.each([
      ["an empty string", ""],
      ["null", null],
    ])("stores a customerId of %s as anonymous", async (_label, customerId) => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const days = [{ date: "20260626", orders: [order({ customerId })] }];

      const result = await storeSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [, values] = queryMock.mock.calls[0];
      expect(JSON.parse(values[1])[0].orders[0].customerId).toBeNull();
      expect(result.dates[0].anonymisedCount).toBe(0);
    });

    it("stores only the hash of a mobile number or email, never the plain id", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 2)]));
      const days = [
        {
          date: "20260626",
          orders: [
            order({ orderId: "SAL-1", customerId: "6591234567" }),
            order({ orderId: "SAL-2", customerId: "Tan@Mail.com" }),
          ],
        },
      ];

      await storeSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [, values] = queryMock.mock.calls[0];
      expect(JSON.parse(values[1])[0].orders.map((o: DatasetOrder) => o.customerId)).toStrictEqual([
        hashCustomerId(SECRET, "6591234567"),
        hashCustomerId(SECRET, "tan@mail.com"),
      ]);
      expect(values[1]).not.toContain("6591234567");
      expect(values[1].toLowerCase()).not.toContain("tan@mail.com");
    });

    it("stores an order with a malformed customerId as anonymous and counts it", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 2)]));
      const days = [
        {
          date: "20260626",
          orders: [
            order({ orderId: "SAL-1", customerId: "tan-6591234567" }),
            order({ orderId: "SAL-2", customerId: "6591234567" }),
          ],
        },
      ];

      const result = await storeSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [, values] = queryMock.mock.calls[0];
      expect(JSON.parse(values[1])[0].orders[0].customerId).toBeNull();
      expect(values[1]).not.toContain("tan-6591234567");
      expect(result.dates).toStrictEqual([
        { date: "20260626", orderCount: 2, anonymisedCount: 1, status: "inserted" },
      ]);
    });

    it("throws NotFoundError when the outlet does not exist", async () => {
      queryMock.mockResolvedValueOnce(pgResult([]));

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }])),
      ).rejects.toThrow(new NotFoundError("Outlet does not exist."));
    });

    it("throws ValidationError when the outlet or its brand is inactive", async () => {
      queryMock.mockResolvedValueOnce(
        pgResult([{ is_active: false, date: null, order_count: null, status: null }]),
      );

      await expect(
        storeSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }])),
      ).rejects.toThrow(new ValidationError("Outlet is inactive."));
    });

    it("returns what was stored per date", async () => {
      queryMock.mockResolvedValueOnce(
        pgResult([storedRow("20260626", 30, "inserted"), storedRow("20260627", 20, "replaced")]),
      );
      const days = [
        { date: "20260626", orders: [] },
        { date: "20260627", orders: [] },
      ];

      const result = await storeSnapshots(fakePool, OUTLET_ID, dataset(days));

      expect(result).toStrictEqual({
        outletId: OUTLET_ID,
        dates: [
          { date: "20260626", orderCount: 30, anonymisedCount: 0, status: "inserted" },
          { date: "20260627", orderCount: 20, anonymisedCount: 0, status: "replaced" },
        ],
      });
    });

    it("stores the order count in its own column", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));

      await storeSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }]));

      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain("order_count = EXCLUDED.order_count");
    });
  });
});

describe("getOrderSnapshotCoverage", () => {
  const RUN_ID = "44444444-4444-4444-4444-444444444444";
  const UPDATED_AT = new Date("2026-06-28T02:00:00Z");
  const RUN_STARTED_AT = new Date("2026-06-28T01:00:00Z");

  const noPublishedRun = {
    published_run_id: null,
    published_from: null,
    published_to: null,
    published_started_at: null,
  };
  const publishedRun = {
    published_run_id: RUN_ID,
    published_from: "2026-06-01",
    published_to: "2026-06-29",
    published_started_at: RUN_STARTED_AT,
  };

  function storedDay(date: string, overrides: Record<string, unknown> = {}) {
    return {
      date,
      is_stored: true,
      order_count: 30,
      size_bytes: 2048,
      updated_at: UPDATED_AT,
      is_stale: false,
      ...noPublishedRun,
      ...overrides,
    };
  }

  function missingDay(date: string, overrides: Record<string, unknown> = {}) {
    return {
      date,
      is_stored: false,
      order_count: null,
      size_bytes: null,
      updated_at: null,
      is_stale: false,
      ...noPublishedRun,
      ...overrides,
    };
  }

  it("throws ValidationError when the outlet id is invalid", async () => {
    await expect(getOrderSnapshotCoverage(fakePool, INVALID_ID)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getOrderSnapshotCoverage(fakePool, OUTLET_ID)).rejects.toThrow(
      new NotFoundError("Outlet does not exist."),
    );
  });

  it("returns no days when the outlet has no snapshots", async () => {
    queryMock.mockResolvedValueOnce(pgResult([missingDay(null as any)]));

    const result = await getOrderSnapshotCoverage(fakePool, OUTLET_ID);

    expect(result).toStrictEqual({ outletId: OUTLET_ID, publishedRun: null, days: [] });
  });

  it("maps stored, missing and stale days", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([
        storedDay("2026-06-28", { is_stale: true, ...publishedRun }),
        missingDay("2026-06-27", publishedRun),
        storedDay("2026-06-26", publishedRun),
      ]),
    );

    const result = await getOrderSnapshotCoverage(fakePool, OUTLET_ID);

    expect(result).toStrictEqual({
      outletId: OUTLET_ID,
      publishedRun: {
        id: RUN_ID,
        from: "2026-06-01",
        to: "2026-06-29",
        startedAt: RUN_STARTED_AT.toISOString(),
      },
      days: [
        {
          date: "2026-06-28",
          isStored: true,
          orderCount: 30,
          sizeBytes: 2048,
          updatedAt: UPDATED_AT.toISOString(),
          isStale: true,
        },
        {
          date: "2026-06-27",
          isStored: false,
          orderCount: null,
          sizeBytes: null,
          updatedAt: null,
          isStale: false,
        },
        {
          date: "2026-06-26",
          isStored: true,
          orderCount: 30,
          sizeBytes: 2048,
          updatedAt: UPDATED_AT.toISOString(),
          isStale: false,
        },
      ],
    });
  });

  it("reads sizes without decompressing the orders and sends only the outlet id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([storedDay("2026-06-26")]));

    await getOrderSnapshotCoverage(fakePool, OUTLET_ID);

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain("pg_column_size(os.orders)");
    expect(sql).not.toContain("jsonb_array_length");
    expect(values).toStrictEqual([OUTLET_ID]);
  });
});

describe("getOrderSnapshot", () => {
  it("throws ValidationError when the outlet id is invalid", async () => {
    await expect(getOrderSnapshot(fakePool, INVALID_ID, "2026-06-26")).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the compact format", "20260626"],
    ["an impossible date", "2026-02-30"],
  ])("throws ValidationError for %s", async (_label, date) => {
    await expect(getOrderSnapshot(fakePool, OUTLET_ID, date)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getOrderSnapshot(fakePool, OUTLET_ID, "2026-06-26")).rejects.toThrow(
      new NotFoundError("Outlet does not exist."),
    );
  });

  it("throws NotFoundError when no snapshot is stored for the date", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ outlet_name: "BEDOK MALL", date: null, orders: null }]),
    );

    await expect(getOrderSnapshot(fakePool, OUTLET_ID, "2026-06-26")).rejects.toThrow(
      new NotFoundError("No snapshot is stored for this date."),
    );
  });

  it("returns the day in the upload format", async () => {
    const orders = [order({ customerId: "CUS-1" })];
    queryMock.mockResolvedValueOnce(
      pgResult([{ outlet_name: "BEDOK MALL", date: "20260626", orders }]),
    );

    const result = await getOrderSnapshot(fakePool, OUTLET_ID, "2026-06-26");

    expect(result).toStrictEqual(dataset([{ date: "20260626", orders }]));
  });

  it("looks up one outlet-day by its key", async () => {
    queryMock.mockResolvedValueOnce(
      pgResult([{ outlet_name: "BEDOK MALL", date: "20260626", orders: [] }]),
    );

    await getOrderSnapshot(fakePool, OUTLET_ID, "2026-06-26");

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain("os.order_date = $2::date");
    expect(values).toStrictEqual([OUTLET_ID, "2026-06-26"]);
  });
});
