import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { BrandRecordSchemaType } from "@ai-services/contracts";
import { pgResult } from "../utils/pg.test-helpers.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "./brand.service.js";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_BRAND_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "44444444-4444-4444-4444-444444444444";
const INVALID_ID = "invalid-id";

const DEFAULT_BRAND: BrandRecordSchemaType = {
  id: BRAND_ID,
  tenantId: TENANT_ID,
  name: "test brand",
  isActive: true,
};

const CREATE_DATA = {
  tenantId: DEFAULT_BRAND.tenantId,
  name: DEFAULT_BRAND.name,
};

const UPDATE_DATA = {
  name: "modified brand name",
  isActive: false,
};

const NAME_VIOLATION = {
  code: UNIQUE_VIOLATION,
  constraint: "brands_tenant_name_key",
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function fakeBrandRow(overrides: Partial<BrandRecordSchemaType> = {}) {
  const brand = { ...DEFAULT_BRAND, ...overrides };

  return {
    id: brand.id,
    tenant_id: brand.tenantId,
    name: brand.name,
    is_active: brand.isActive,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getBrands", () => {
  it("throws ValidationError when the tenant id filter is invalid", async () => {
    await expect(getBrands(fakePool, { tenantId: INVALID_ID })).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns all brands regardless of status when no filter is given", async () => {
    const inactiveBrand = {
      ...DEFAULT_BRAND,
      id: OTHER_BRAND_ID,
      name: "inactive brand",
      isActive: false,
    };
    queryMock.mockResolvedValueOnce(
      pgResult([fakeBrandRow(), fakeBrandRow(inactiveBrand)]),
    );

    const result = await getBrands(fakePool);

    expect(queryMock).toHaveBeenCalledWith(
      expect.not.stringContaining("WHERE"),
      [],
    );
    expect(result).toStrictEqual([DEFAULT_BRAND, inactiveBrand]);
  });

  it("filters brands by tenant id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow()]));

    const result = await getBrands(fakePool, { tenantId: TENANT_ID });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE b.tenant_id = $1"),
      [TENANT_ID],
    );
    expect(result).toStrictEqual([DEFAULT_BRAND]);
  });

  it("orders brands by name, then id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await getBrands(fakePool);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY b.name, b.id"),
      [],
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
    await expect(getBrand(fakePool, INVALID_ID)).rejects.toThrow(
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
  it.each([
    { label: "the name is missing", data: { tenantId: TENANT_ID } },
    { label: "the name is empty", data: { tenantId: TENANT_ID, name: "" } },
    {
      label: "the name is only whitespace",
      data: { tenantId: TENANT_ID, name: "   " },
    },
    {
      label: "the name has surrounding whitespace",
      data: { tenantId: TENANT_ID, name: " Thai Express " },
    },
    { label: "the tenant id is missing", data: { name: "test brand" } },
    {
      label: "the tenant id is invalid",
      data: { tenantId: INVALID_ID, name: "test brand" },
    },
    {
      label: "an unknown field is supplied",
      data: { ...CREATE_DATA, isActive: false },
    },
  ])("throws ValidationError when $label", async ({ data }) => {
    await expect(createBrand(fakePool, data as any)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the tenant does not exist", async () => {
    queryMock.mockRejectedValueOnce({ code: FOREIGN_KEY_VIOLATION });

    await expect(createBrand(fakePool, CREATE_DATA)).rejects.toThrow(
      new NotFoundError("Tenant does not exist."),
    );
  });

  it("throws ConflictError naming the brand when the name already exists in the tenant", async () => {
    queryMock.mockRejectedValueOnce(NAME_VIOLATION);

    await expect(createBrand(fakePool, CREATE_DATA)).rejects.toThrow(
      new ConflictError(
        `Brand ${CREATE_DATA.name} already exists for this tenant.`,
      ),
    );
  });

  it("creates and returns the brand", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow()]));

    const result = await createBrand(fakePool, CREATE_DATA);

    const [sql, values] = queryMock.mock.calls[0];
    // Compare on collapsed whitespace so line breaks in the SQL don't matter.
    const flatSql = sql.replace(/\s+/g, " ");
    expect(flatSql).toContain(
      "INSERT INTO brands (tenant_id, name) VALUES ($1, $2)",
    );
    expect(flatSql).toContain(
      "INSERT INTO brand_data_sources (brand_id) SELECT id FROM b",
    );
    expect(flatSql).toContain(
      "INSERT INTO calculation_config_versions (brand_id, job_type) SELECT b.id, 'outlet_item_scores' FROM b",
    );
    expect(flatSql).toContain(
      "INSERT INTO outlet_item_scores_calculation_config_versions (id) SELECT ccv.id FROM ccv",
    );
    expect(values).toStrictEqual([CREATE_DATA.tenantId, CREATE_DATA.name]);
    expect(result).toStrictEqual(DEFAULT_BRAND);
  });
});

describe("updateBrand", () => {
  it("throws ValidationError when the brand id is invalid", async () => {
    await expect(
      updateBrand(fakePool, INVALID_ID, UPDATE_DATA),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the data is empty", async () => {
    await expect(updateBrand(fakePool, BRAND_ID, {})).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the new name has surrounding whitespace", async () => {
    await expect(
      updateBrand(fakePool, BRAND_ID, { name: "Thai Express " }),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when trying to move the brand to another tenant", async () => {
    await expect(
      updateBrand(fakePool, BRAND_ID, { tenantId: TENANT_ID } as any),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(updateBrand(fakePool, BRAND_ID, UPDATE_DATA)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ConflictError when the brand name already exists", async () => {
    queryMock.mockRejectedValueOnce(NAME_VIOLATION);

    await expect(updateBrand(fakePool, BRAND_ID, UPDATE_DATA)).rejects.toThrow(
      ConflictError,
    );
  });

  it("refreshes updated_at", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeBrandRow()]));

    await updateBrand(fakePool, BRAND_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("updated_at = now()"),
      expect.any(Array),
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
