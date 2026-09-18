import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../errors.js";
import { genValidUuid } from "../utils/uuid.test-helpers.js";
import { getBrand } from "./brand.service.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getBrand", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("throws ValidationError when the brand id is invalid", async () => {
    await expect(getBrand(fakePool, "invalid-brand-id")).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(getBrand(fakePool, genValidUuid())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns brand when brand id is valid and existed", async () => {
    const brandId = genValidUuid();

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: brandId,
        },
      ],
    });

    const result = await getBrand(fakePool, brandId);

    expect(result).toEqual({ id: brandId });
  });
});
