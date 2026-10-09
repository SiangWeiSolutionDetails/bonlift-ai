import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { OutletRecordSchemaType } from "../schemas/outlet.schema.js";
import { pgResult } from "../utils/pg.test-helpers.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createOutlet,
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
  brandId: BRAND_ID,
  externalId: "pos-outlet-1",
  name: "test outlet",
  isActive: true,
};

const CREATE_DATA = {
  brandId: DEFAULT_OUTLET.brandId,
  externalId: DEFAULT_OUTLET.externalId,
  name: DEFAULT_OUTLET.name,
};

const UPDATE_DATA = {
  name: "modified outlet name",
  isActive: false,
};

const EXTERNAL_ID_VIOLATION = {
  code: UNIQUE_VIOLATION,
  constraint: "outlets_brand_external_id_key",
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
    brand_id: outlet.brandId,
    external_id: outlet.externalId,
    name: outlet.name,
    is_active: outlet.isActive,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getOutlets", () => {
  it("throws ValidationError when the brand id filter is invalid", async () => {
    await expect(getOutlets(fakePool, { brandId: INVALID_ID })).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns all outlets regardless of status when no filter is given", async () => {
    const inactiveOutlet = {
      ...DEFAULT_OUTLET,
      id: OTHER_OUTLET_ID,
      externalId: "pos-outlet-2",
      name: "inactive outlet",
      isActive: false,
    };
    queryMock.mockResolvedValueOnce(
      pgResult([fakeOutletRow(), fakeOutletRow(inactiveOutlet)]),
    );

    const result = await getOutlets(fakePool, {});

    expect(queryMock).toHaveBeenCalledWith(
      expect.not.stringContaining("WHERE"),
      [],
    );
    expect(result).toStrictEqual([DEFAULT_OUTLET, inactiveOutlet]);
  });

  it("filters outlets by brand id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await getOutlets(fakePool, { brandId: BRAND_ID });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("WHERE o.brand_id = $1"),
      [BRAND_ID],
    );
    expect(result).toStrictEqual([DEFAULT_OUTLET]);
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
      data: { brandId: BRAND_ID, externalId: "pos-outlet-1" },
    },
    {
      label: "the brand id is missing",
      data: { externalId: "pos-outlet-1", name: "test outlet" },
    },
    {
      label: "the brand id is invalid",
      data: { brandId: INVALID_ID, externalId: "pos-outlet-1", name: "x" },
    },
    {
      label: "the external id is missing",
      data: { brandId: BRAND_ID, name: "test outlet" },
    },
    {
      label: "a tenant id is supplied",
      data: { ...CREATE_DATA, tenantId: TENANT_ID },
    },
  ])("throws ValidationError when $label", async ({ data }) => {
    await expect(createOutlet(fakePool, data as any)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockRejectedValueOnce({ code: FOREIGN_KEY_VIOLATION });

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      new NotFoundError("Brand does not exist."),
    );
  });

  it("throws ConflictError naming the external id when it already exists in the brand", async () => {
    queryMock.mockRejectedValueOnce(EXTERNAL_ID_VIOLATION);

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      `external id ${CREATE_DATA.externalId}`,
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

  it("inserts the outlet under its brand and returns it", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await createOutlet(fakePool, CREATE_DATA);

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain(
      "INSERT INTO outlets (brand_id, external_id, name) VALUES ($1, $2, $3)",
    );
    expect(values).toStrictEqual([
      CREATE_DATA.brandId,
      CREATE_DATA.externalId,
      CREATE_DATA.name,
    ]);
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
});
