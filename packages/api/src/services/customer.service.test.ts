import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomer } from "./customer.service.js";
import { NotFoundError, ValidationError } from "../errors.js";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getCustomer", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("throws ValidationError when the customer id is invalid", async () => {
    await expect(getCustomer(fakePool, "invalid-customer-id")).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the customer does not exist", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(getCustomer(fakePool, CUSTOMER_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns customer when customer id is valid and existed", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: CUSTOMER_ID,
        },
      ],
    });

    const result = await getCustomer(fakePool, CUSTOMER_ID);

    expect(result).toEqual({ id: CUSTOMER_ID });
  });
});
