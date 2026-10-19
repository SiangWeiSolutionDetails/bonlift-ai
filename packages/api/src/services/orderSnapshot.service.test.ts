import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatasetSchemaType } from "@ai-services/contracts";
import { NotFoundError, ValidationError } from "../errors.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { storeOrderSnapshots } from "./orderSnapshot.service.js";

const OUTLET_ID = "33333333-3333-3333-3333-333333333333";
const INVALID_ID = "invalid-id";

type DatasetDay = DatasetSchemaType["dates"][number];
type DatasetOrder = DatasetDay["orders"][number];

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function order(overrides: Partial<DatasetOrder> = {}): DatasetOrder {
  return {
    orderId: "SAL-0001",
    orderedAt: "2026-06-26T12:00:00Z",
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

beforeEach(() => {
  queryMock.mockReset();
});

describe("storeOrderSnapshots", () => {
  describe("validation (never reaches the database)", () => {
    it("throws ValidationError when the outlet id is invalid", async () => {
      await expect(
        storeOrderSnapshots(fakePool, INVALID_ID, dataset([{ date: "20260626", orders: [] }])),
      ).rejects.toThrow(ValidationError);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when there are no dates", async () => {
      await expect(storeOrderSnapshots(fakePool, OUTLET_ID, dataset([]))).rejects.toThrow(
        ValidationError,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError for an impossible date", async () => {
      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260230", orders: [] }])),
      ).rejects.toThrow("20260230 is not a valid YYYYMMDD date.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when a date appears twice", async () => {
      const day = { date: "20260626", orders: [] };

      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset([day, { ...day }])),
      ).rejects.toThrow("20260626 appears more than once.");
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when an order belongs to another date", async () => {
      const day = {
        date: "20260626",
        orders: [order({ orderId: "SAL-0042", orderedAt: "2026-06-27T00:30:00Z" })],
      };

      await expect(storeOrderSnapshots(fakePool, OUTLET_ID, dataset([day]))).rejects.toThrow(
        "20260626: order SAL-0042 was placed on 20260627.",
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

  });

  describe("accepted input", () => {
    it.each([
      ["the first second of the day", "2026-06-26T00:00:00Z"],
      ["the last second of the day", "2026-06-26T23:59:59Z"],
    ])("accepts an order at %s", async (_label, orderedAt) => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const day = { date: "20260626", orders: [order({ orderedAt })] };

      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset([day])),
      ).resolves.toBeDefined();
    });

    it("stores an order id that appears twice on the same date as sent", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 2)]));
      const days = [{ date: "20260626", orders: [order(), order()] }];

      await storeOrderSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [, values] = queryMock.mock.calls[0];
      expect(JSON.parse(values[1])[0].orders).toHaveLength(2);
    });

    it("accepts the same order id on different dates", async () => {
      queryMock.mockResolvedValueOnce(
        pgResult([storedRow("20260626", 1), storedRow("20260627", 1)]),
      );
      const days = [
        { date: "20260626", orders: [order()] },
        { date: "20260627", orders: [order({ orderedAt: "2026-06-27T12:00:00Z" })] },
      ];

      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset(days)),
      ).resolves.toBeDefined();
    });

    it("accepts a date with no orders", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 0)]));

      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }])),
      ).resolves.toBeDefined();
    });
  });

  describe("storing", () => {
    it("sends the outlet id and the dates as one JSON parameter", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const days = [{ date: "20260626", orders: [order()] }];

      await storeOrderSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [sql, values] = queryMock.mock.calls[0];
      expect(sql).toContain("INSERT INTO order_snapshots");
      expect(values).toStrictEqual([OUTLET_ID, JSON.stringify(days)]);
    });

    it("strips unknown fields before storing", async () => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const withExtras = {
        ...dataset([
          { date: "20260626", orders: [{ ...order(), unknownOrderField: "x" } as DatasetOrder] },
        ]),
        unknownRootField: "y",
      };

      await storeOrderSnapshots(fakePool, OUTLET_ID, withExtras);

      const [, values] = queryMock.mock.calls[0];
      expect(values[1]).not.toContain("unknownOrderField");
    });

    it.each([
      ["an empty string", ""],
      ["null", null],
    ])("keeps customerId as %s", async (_label, customerId) => {
      queryMock.mockResolvedValueOnce(pgResult([storedRow("20260626", 1)]));
      const days = [{ date: "20260626", orders: [order({ customerId })] }];

      await storeOrderSnapshots(fakePool, OUTLET_ID, dataset(days));

      const [, values] = queryMock.mock.calls[0];
      expect(JSON.parse(values[1])[0].orders[0].customerId).toBe(customerId);
    });

    it("throws NotFoundError when the outlet does not exist", async () => {
      queryMock.mockResolvedValueOnce(pgResult([]));

      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }])),
      ).rejects.toThrow(new NotFoundError("Outlet does not exist."));
    });

    it("throws ValidationError when the outlet or its brand is inactive", async () => {
      queryMock.mockResolvedValueOnce(
        pgResult([{ is_active: false, date: null, order_count: null, status: null }]),
      );

      await expect(
        storeOrderSnapshots(fakePool, OUTLET_ID, dataset([{ date: "20260626", orders: [] }])),
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

      const result = await storeOrderSnapshots(fakePool, OUTLET_ID, dataset(days));

      expect(result).toStrictEqual({
        outletId: OUTLET_ID,
        dates: [
          { date: "20260626", orderCount: 30, status: "inserted" },
          { date: "20260627", orderCount: 20, status: "replaced" },
        ],
      });
    });
  });
});
