import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { genValidUuid } from "../utils/uuid.test-helpers.js";
import {
  BrandRecord,
  createBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "./brand.service.js";
import { UNIQUE_VIOLATION } from "../utils/pgErrors.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function fakeBrandRow(
  overrides: Partial<BrandRecord> = {},
): Record<string, unknown> {
  const brand = {
    id: genValidUuid(),
    name: "test brand",
    isActive: true,
    ...overrides,
  };

  return {
    id: brand.id,
    name: brand.name,
    is_active: brand.isActive,
  };
}

describe("getBrands", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns all active brands", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow()],
    });

    const result = await getBrands(fakePool);

    expect(result.length).toEqual(1);
  });

  it("returns all brands", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow(), fakeBrandRow({ isActive: false })],
    });

    const result = await getBrands(fakePool, { includeInactive: true });

    expect(
      result.filter((row) => !Boolean(row.isActive)).length,
    ).greaterThanOrEqual(1);
  });
});

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

  it("throws NotFoundError when the brand does not exist or inactive", async () => {
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

describe("createBrand", async () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("throws ValidationError if the name is missing", async () => {
    const data = {} as any;

    await expect(createBrand(fakePool, data)).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ConflictError if brand name already exists", async () => {
    const data = { name: "any brand name" };

    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION });

    await expect(createBrand(fakePool, data)).rejects.toThrow(ConflictError);
  });

  it("creates brand successfully", async () => {
    const data = { name: "any brand name" };

    const expectedResult = {
      id: genValidUuid(),
      name: data.name,
      isActive: true,
    };

    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow(expectedResult)],
    });

    const result = await createBrand(fakePool, data);

    expect(result).toEqual(expectedResult);
  });
});

describe("updateBrand", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("throws ValidationError if brand id is invalid", async () => {
    const brandId = "invalid-brand-id";
    const data = {
      name: "modified brand name",
      isActive: false,
    };

    await expect(updateBrand(fakePool, brandId, data)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError if data is empty object", async () => {
    const brandId = genValidUuid();
    const data = {};

    await expect(updateBrand(fakePool, brandId, data)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError if brand id does not exist", async () => {
    const brandId = genValidUuid();
    const data = {
      name: "modified brand name",
      isActive: false,
    };

    queryMock.mockResolvedValueOnce({
      rows: [],
    });

    await expect(updateBrand(fakePool, brandId, data)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ConflictError if brand name already exists", async () => {
    const brandId = genValidUuid();
    const data = {
      name: "modified brand name",
      isActive: false,
    };

    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow({ id: brandId })],
    });
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION });

    await expect(updateBrand(fakePool, brandId, data)).rejects.toThrow(
      ConflictError,
    );
  });

  it("updates brand successfully with either field", async () => {
    const brandId = genValidUuid();
    const data = {
      isActive: false,
    };

    const expectedResult = { id: brandId, name: "test brand", ...data };

    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow({ id: brandId })],
    });
    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow(expectedResult)],
    });

    const result = await updateBrand(fakePool, brandId, data);

    expect(result).toEqual(expectedResult);
  });

  it("updates brand successfully for all fields", async () => {
    const brandId = genValidUuid();
    const data = {
      name: "modified brand name",
      isActive: false,
    };

    const expectedResult = { id: brandId, ...data };

    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow({ id: brandId })],
    });
    queryMock.mockResolvedValueOnce({
      rows: [fakeBrandRow(expectedResult)],
    });

    const result = await updateBrand(fakePool, brandId, data);

    expect(result).toEqual(expectedResult);
  });
});
