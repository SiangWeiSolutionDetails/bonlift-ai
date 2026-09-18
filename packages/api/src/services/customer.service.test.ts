import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomer } from "./customer.service.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { genValidUuid } from "../utils/uuid.test-helpers.js";

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

    await expect(getCustomer(fakePool, genValidUuid())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns customer when customer id is valid and existed", async () => {
    const customerId = genValidUuid();

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: customerId,
        },
      ],
    });

    const result = await getCustomer(fakePool, customerId);

    expect(result).toEqual({ id: customerId });
  });
});
