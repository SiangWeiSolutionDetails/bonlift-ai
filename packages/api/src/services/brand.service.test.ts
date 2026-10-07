import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { BrandRecordSchemaType } from "../schemas/brand.schema.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "./brand.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_BRAND_ID = "22222222-2222-2222-2222-222222222222";
const INVALID_BRAND_ID = "invalid-brand-id";

const DEFAULT_BRAND: BrandRecordSchemaType = {
  id: BRAND_ID,
  name: "test brand",
  isActive: true,
};

const UPDATE_DATA = {
  name: "modified brand name",
  isActive: false,
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function fakeBrandRow(overrides: Partial<BrandRecordSchemaType> = {}) {
  const brand = { ...DEFAULT_BRAND, ...overrides };

  return {
    id: brand.id,
    name: brand.name,
    is_active: brand.isActive,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getBrands", () => {
  it("returns all brands regardless of status", async () => {
    const inactiveBrand = {
      id: OTHER_BRAND_ID,
      name: "inactive brand",
      isActive: false,
    };
    queryMock.mockResolvedValueOnce(
      pgResult([fakeBrandRow(), fakeBrandRow(inactiveBrand)]),
    );

    const result = await getBrands(fakePool);

    expect(result).toStrictEqual([DEFAULT_BRAND, inactiveBrand]);
  });

  it("orders brands by name", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await getBrands(fakePool);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY b.name"),
    );
  });

  it("returns an empty array when there are no brands", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    const result = await getBrands(fakePool);

    expect(result).toStrictEqual([]);
  });
});

describe("getBrand", () => {
  it("throws ValidationError when the brand id is invalid", async () => {
    await expect(getBrand(fakePool, INVALID_BRAND_ID)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getBrand(fakePool, BRAND_ID)).rejects.toThrow(NotFoundError);
  });

  it("returns the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow()]));

    const result = await getBrand(fakePool, BRAND_ID);

    expect(result).toStrictEqual(DEFAULT_BRAND);
  });
});

describe("createBrand", () => {
  it("throws ValidationError when the name is missing", async () => {
    await expect(createBrand(fakePool, {} as any)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ConflictError when the brand name already exists", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION });

    await expect(
      createBrand(fakePool, { name: DEFAULT_BRAND.name }),
    ).rejects.toThrow(ConflictError);
  });

  it("creates and returns the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow()]));

    const result = await createBrand(fakePool, { name: DEFAULT_BRAND.name });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO brands"),
      [DEFAULT_BRAND.name],
    );
    expect(result).toStrictEqual(DEFAULT_BRAND);
  });
});

describe("updateBrand", () => {
  it("throws ValidationError when the brand id is invalid", async () => {
    await expect(
      updateBrand(fakePool, INVALID_BRAND_ID, UPDATE_DATA),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the data is empty", async () => {
    await expect(updateBrand(fakePool, BRAND_ID, {})).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(updateBrand(fakePool, BRAND_ID, UPDATE_DATA)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ConflictError when the brand name already exists", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION });

    await expect(updateBrand(fakePool, BRAND_ID, UPDATE_DATA)).rejects.toThrow(
      ConflictError,
    );
  });

  it.each([
    { field: "isActive", data: { isActive: UPDATE_DATA.isActive } },
    { field: "name", data: { name: UPDATE_DATA.name } },
  ])("updates only $field", async ({ data }) => {
    const expectedResult = { ...DEFAULT_BRAND, ...data };
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow(expectedResult)]));

    const result = await updateBrand(fakePool, BRAND_ID, data);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE brands"),
      [...Object.values(data), BRAND_ID],
    );
    expect(result).toStrictEqual(expectedResult);
  });

  it("updates all fields", async () => {
    const expectedResult = { ...DEFAULT_BRAND, ...UPDATE_DATA };
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow(expectedResult)]));

    const result = await updateBrand(fakePool, BRAND_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE brands"),
      [UPDATE_DATA.name, UPDATE_DATA.isActive, BRAND_ID],
    );
    expect(result).toStrictEqual(expectedResult);
  });
});
