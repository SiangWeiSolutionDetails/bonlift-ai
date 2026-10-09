import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import type { TenantRecordSchemaType } from "@ai-services/contracts";
import { pgResult } from "../utils/pg.test-helpers.js";
import { UNIQUE_VIOLATION } from "../utils/pgErrors.js";
import {
  createTenant,
  getTenant,
  getTenants,
  updateTenant,
} from "./tenant.service.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-2222-2222-222222222222";
const INVALID_ID = "invalid-id";

const DEFAULT_TENANT: TenantRecordSchemaType = {
  id: TENANT_ID,
  name: "test tenant",
  isActive: true,
};

const CREATE_DATA = {
  name: DEFAULT_TENANT.name,
};

const UPDATE_DATA = {
  name: "modified tenant name",
  isActive: false,
};

const NAME_VIOLATION = {
  code: UNIQUE_VIOLATION,
  constraint: "tenants_name_key",
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function fakeTenantRow(overrides: Partial<TenantRecordSchemaType> = {}) {
  const tenant = { ...DEFAULT_TENANT, ...overrides };

  return {
    id: tenant.id,
    name: tenant.name,
    is_active: tenant.isActive,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("getTenants", () => {
  it("returns all tenants regardless of status", async () => {
    const inactiveTenant = {
      id: OTHER_TENANT_ID,
      name: "inactive tenant",
      isActive: false,
    };
    queryMock.mockResolvedValueOnce(
      pgResult([fakeTenantRow(), fakeTenantRow(inactiveTenant)]),
    );

    const result = await getTenants(fakePool);

    expect(result).toStrictEqual([DEFAULT_TENANT, inactiveTenant]);
  });

  it("orders tenants by name, then id", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await getTenants(fakePool);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY t.name, t.id"),
    );
  });

  it("returns an empty array when there are no tenants", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    const result = await getTenants(fakePool);

    expect(result).toStrictEqual([]);
  });
});

describe("getTenant", () => {
  it("throws ValidationError when the tenant id is invalid", async () => {
    await expect(getTenant(fakePool, INVALID_ID)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the tenant does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(getTenant(fakePool, TENANT_ID)).rejects.toThrow(NotFoundError);
  });

  it("returns the tenant", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeTenantRow()]));

    const result = await getTenant(fakePool, TENANT_ID);

    expect(result).toStrictEqual(DEFAULT_TENANT);
  });
});

describe("createTenant", () => {
  it.each([
    { label: "the name is missing", data: {} },
    { label: "the name is empty", data: { name: "" } },
    { label: "the name is only whitespace", data: { name: "   " } },
    { label: "the name has trailing whitespace", data: { name: "Minor " } },
    { label: "the name has leading whitespace", data: { name: " Minor" } },
    {
      label: "an unknown field is supplied",
      data: { ...CREATE_DATA, isActive: false },
    },
  ])("throws ValidationError when $label", async ({ data }) => {
    await expect(createTenant(fakePool, data as any)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ConflictError naming the tenant when the name already exists", async () => {
    queryMock.mockRejectedValueOnce(NAME_VIOLATION);

    await expect(createTenant(fakePool, CREATE_DATA)).rejects.toThrow(
      new ConflictError(`Tenant ${CREATE_DATA.name} already exists.`),
    );
  });

  it("creates and returns the tenant", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeTenantRow()]));

    const result = await createTenant(fakePool, CREATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tenants (name) VALUES ($1)"),
      [CREATE_DATA.name],
    );
    expect(result).toStrictEqual(DEFAULT_TENANT);
  });
});

describe("updateTenant", () => {
  it("throws ValidationError when the tenant id is invalid", async () => {
    await expect(
      updateTenant(fakePool, INVALID_ID, UPDATE_DATA),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the data is empty", async () => {
    await expect(updateTenant(fakePool, TENANT_ID, {})).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the new name has surrounding whitespace", async () => {
    await expect(
      updateTenant(fakePool, TENANT_ID, { name: " renamed " }),
    ).rejects.toThrow(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("accepts a name with inner spaces", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeTenantRow()]));

    await expect(
      updateTenant(fakePool, TENANT_ID, { name: "Minor Food Group" }),
    ).resolves.toBeDefined();
  });

  it("throws NotFoundError when the tenant does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      updateTenant(fakePool, TENANT_ID, UPDATE_DATA),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when the tenant name already exists", async () => {
    queryMock.mockRejectedValueOnce(NAME_VIOLATION);

    await expect(
      updateTenant(fakePool, TENANT_ID, UPDATE_DATA),
    ).rejects.toThrow(ConflictError);
  });

  it("refreshes updated_at", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeTenantRow()]));

    await updateTenant(fakePool, TENANT_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("updated_at = now()"),
      expect.any(Array),
    );
  });

  it.each([
    { field: "isActive", data: { isActive: UPDATE_DATA.isActive } },
    { field: "name", data: { name: UPDATE_DATA.name } },
  ])("updates only $field", async ({ data }) => {
    const expectedResult = { ...DEFAULT_TENANT, ...data };
    queryMock.mockResolvedValueOnce(pgResult([fakeTenantRow(expectedResult)]));

    const result = await updateTenant(fakePool, TENANT_ID, data);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tenants"),
      [...Object.values(data), TENANT_ID],
    );
    expect(result).toStrictEqual(expectedResult);
  });

  it("updates all fields", async () => {
    const expectedResult = { ...DEFAULT_TENANT, ...UPDATE_DATA };
    queryMock.mockResolvedValueOnce(pgResult([fakeTenantRow(expectedResult)]));

    const result = await updateTenant(fakePool, TENANT_ID, UPDATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tenants"),
      [UPDATE_DATA.name, UPDATE_DATA.isActive, TENANT_ID],
    );
    expect(result).toStrictEqual(expectedResult);
  });
});
