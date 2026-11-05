import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { OutletRecordSchemaType } from "@ai-services/contracts";
import { pgResult } from "../utils/pg.test-helpers.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createOutlet,
  deleteOutlet,
  getOutlet,
  getOutlets,
  updateOutlet,
} from "./outlet.service.js";

const OUTLET_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_OUTLET_ID = "22222222-2222-2222-2222-222222222222";
const BRAND_ID = "33333333-3333-3333-3333-333333333333";
const TENANT_ID = "44444444-4444-4444-4444-444444444444";
const INVALID_ID = "invalid-id";

const DEFAULT_OUTLET: OutletRecordSchemaType = {
  id: OUTLET_ID,
  tenantId: TENANT_ID,
  brandId: BRAND_ID,
  name: "test outlet",
  isActive: true,
};

const CREATE_DATA = {
  brandId: DEFAULT_OUTLET.brandId,
  name: DEFAULT_OUTLET.name,
};

const UPDATE_DATA = {
  name: "modified outlet name",
  isActive: false,
};

const NAME_VIOLATION = {
  code: UNIQUE_VIOLATION,
  constraint: "outlets_brand_name_key",
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function fakeOutletRow(overrides: Partial<OutletRecordSchemaType> = {}) {
  const outlet = { ...DEFAULT_OUTLET, ...overrides };

  return {
    id: outlet.id,
    tenant_id: outlet.tenantId,
    brand_id: outlet.brandId,
    name: outlet.name,
    is_active: outlet.isActive,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getOutlets", () => {
  it.each([
    { field: "brandId", options: { brandId: INVALID_ID } },
    { field: "tenantId", options: { tenantId: INVALID_ID } },
  ])("throws ValidationError when the $field filter is invalid", async ({ options }) => {
    await expect(getOutlets(fakePool, options)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns all live outlets regardless of status when no filter is given", async () => {
    const inactiveOutlet = {
      ...DEFAULT_OUTLET,
      id: OTHER_OUTLET_ID,
      name: "inactive outlet",
      isActive: false,
    };
    queryMock.mockResolvedValueOnce(
      pgResult([fakeOutletRow(), fakeOutletRow(inactiveOutlet)]),
    );

    const result = await getOutlets(fakePool, {});

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE o.deleted_at IS NULL\n"),
      [],
    );
    expect(result).toStrictEqual([DEFAULT_OUTLET, inactiveOutlet]);
  });

  it("filters outlets by brand id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await getOutlets(fakePool, { brandId: BRAND_ID });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE o.deleted_at IS NULL AND o.brand_id = $1"),
      [BRAND_ID],
    );
    expect(result).toStrictEqual([DEFAULT_OUTLET]);
  });

  it("filters outlets by tenant id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await getOutlets(fakePool, { tenantId: TENANT_ID });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE o.deleted_at IS NULL AND o.tenant_id = $1"),
      [TENANT_ID],
    );
    expect(result).toStrictEqual([DEFAULT_OUTLET]);
  });

  it("combines the tenant and brand filters", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    await getOutlets(fakePool, { tenantId: TENANT_ID, brandId: BRAND_ID });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE o.deleted_at IS NULL AND o.tenant_id = $1 AND o.brand_id = $2",
      ),
      [TENANT_ID, BRAND_ID],
    );
  });

  it("orders outlets by name, then id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await getOutlets(fakePool, {});

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY o.name, o.id"),
      [],
    );
  });

  it("returns an empty array when there are no outlets", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    const result = await getOutlets(fakePool, {});

    expect(result).toStrictEqual([]);
  });
});

describe("getOutlet", () => {
  it("throws ValidationError when the outlet id is invalid", async () => {
    await expect(getOutlet(fakePool, INVALID_ID)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getOutlet(fakePool, OUTLET_ID)).rejects.toThrow(NotFoundError);
  });

  it("looks up live outlets only", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    await getOutlet(fakePool, OUTLET_ID);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("AND o.deleted_at IS NULL"),
      [OUTLET_ID],
    );
  });

  it("returns the outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await getOutlet(fakePool, OUTLET_ID);

    expect(result).toStrictEqual(DEFAULT_OUTLET);
  });
});

describe("createOutlet", () => {
  it.each([
    {
      label: "the name is missing",
      data: { brandId: BRAND_ID },
    },
    {
      label: "the name is only whitespace",
      data: { brandId: BRAND_ID, name: "   " },
    },
    {
      label: "the name has surrounding whitespace",
      data: { brandId: BRAND_ID, name: " Raffles City " },
    },
    {
      label: "the brand id is missing",
      data: { name: "test outlet" },
    },
    {
      label: "the brand id is invalid",
      data: { brandId: INVALID_ID, name: "x" },
    },
    {
      label: "a tenant id is supplied",
      data: { ...CREATE_DATA, tenantId: TENANT_ID },
    },
    {
      label: "an external id is supplied",
      data: { ...CREATE_DATA, externalId: "pos-outlet-1" },
    },
  ])("throws ValidationError when $label", async ({ data }) => {
    await expect(createOutlet(fakePool, data as any)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      new NotFoundError("Brand does not exist."),
    );
  });

  it("throws NotFoundError when the brand foreign key is violated", async () => {
    queryMock.mockRejectedValueOnce({ code: FOREIGN_KEY_VIOLATION });

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      new NotFoundError("Brand does not exist."),
    );
  });

  it("throws ConflictError when the outlet name already exists in the brand", async () => {
    queryMock.mockRejectedValueOnce(NAME_VIOLATION);

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      new ConflictError(
        `Outlet ${CREATE_DATA.name} already exists for this brand.`,
      ),
    );
  });

  it("inserts the outlet under its brand, taking the tenant from the brand, and returns it", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await createOutlet(fakePool, CREATE_DATA);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO outlets (tenant_id, brand_id, name)");
    expect(sql).toContain("SELECT b.tenant_id, b.id, $2");
    expect(sql.replace(/\s+/g, " ")).toContain(
      "WHERE b.id = $1 AND b.deleted_at IS NULL FOR SHARE",
    );
    expect(values).toStrictEqual([CREATE_DATA.brandId, CREATE_DATA.name]);
    expect(result).toStrictEqual(DEFAULT_OUTLET);
  });
});

describe("updateOutlet", () => {
  it("throws ValidationError when the outlet id is invalid", async () => {
    await expect(
      updateOutlet(fakePool, INVALID_ID, UPDATE_DATA),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the data is empty", async () => {
    await expect(updateOutlet(fakePool, OUTLET_ID, {})).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the new name has surrounding whitespace", async () => {
    await expect(
      updateOutlet(fakePool, OUTLET_ID, { name: "Raffles City " }),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "brandId", data: { brandId: BRAND_ID } },
    { field: "tenantId", data: { tenantId: TENANT_ID } },
    { field: "externalId", data: { externalId: "other" } },
  ])("throws ValidationError when trying to change $field", async ({ data }) => {
    await expect(
      updateOutlet(fakePool, OUTLET_ID, data as any),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when the outlet name already exists in the brand", async () => {
    queryMock.mockRejectedValueOnce(NAME_VIOLATION);

    await expect(
      updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA),
    ).rejects.toThrow(ConflictError);
  });

  it("refreshes updated_at", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    await updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("updated_at = now()"),
      expect.any(Array),
    );
  });

  it.each([
    { field: "isActive", data: { isActive: UPDATE_DATA.isActive } },
    { field: "name", data: { name: UPDATE_DATA.name } },
  ])("updates only $field", async ({ data }) => {
    const expectedResult = { ...DEFAULT_OUTLET, ...data };
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow(expectedResult)]));

    const result = await updateOutlet(fakePool, OUTLET_ID, data);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE outlets"),
      [...Object.values(data), OUTLET_ID],
    );
    expect(result).toStrictEqual(expectedResult);
  });

  it("updates all fields", async () => {
    const expectedResult = { ...DEFAULT_OUTLET, ...UPDATE_DATA };
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow(expectedResult)]));

    const result = await updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE outlets"),
      [UPDATE_DATA.name, UPDATE_DATA.isActive, OUTLET_ID],
    );
    expect(result).toStrictEqual(expectedResult);
  });

  it("does not update a deleted outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    await updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("AND o.deleted_at IS NULL"),
      expect.any(Array),
    );
  });
});

describe("deleteOutlet", () => {
  it("throws ValidationError when the outlet id is invalid", async () => {
    await expect(deleteOutlet(fakePool, INVALID_ID)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the outlet does not exist or is already deleted", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 0));

    await expect(deleteOutlet(fakePool, OUTLET_ID)).rejects.toThrow(
      new NotFoundError("Outlet does not exist."),
    );
  });

  it("soft deletes a live outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([], 1));

    await deleteOutlet(fakePool, OUTLET_ID);

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql.replace(/\s+/g, " ").trim()).toBe(
      "UPDATE outlets SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL",
    );
    expect(values).toStrictEqual([OUTLET_ID]);
  });
});
