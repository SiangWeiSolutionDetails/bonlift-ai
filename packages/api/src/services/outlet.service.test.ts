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
const INVALID_ID = "invalid-id";

const DEFAULT_OUTLET: OutletRecordSchemaType = {
  id: OUTLET_ID,
  name: "test outlet",
  brandId: BRAND_ID,
  isActive: true,
};

const CREATE_DATA = {
  name: DEFAULT_OUTLET.name,
  brandId: DEFAULT_OUTLET.brandId,
};

const UPDATE_DATA = {
  name: "modified outlet name",
  isActive: false,
};

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

function fakeOutletRow(overrides: Partial<OutletRecordSchemaType> = {}) {
  const outlet = { ...DEFAULT_OUTLET, ...overrides };

  return {
    id: outlet.id,
    name: outlet.name,
    brand_id: outlet.brandId,
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
    { label: "the name is missing", data: { brandId: BRAND_ID } },
    { label: "the brand id is missing", data: { name: DEFAULT_OUTLET.name } },
    {
      label: "the brand id is invalid",
      data: { name: DEFAULT_OUTLET.name, brandId: INVALID_ID },
    },
  ])("throws ValidationError when $label", async ({ data }) => {
    await expect(createOutlet(fakePool, data as any)).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws ConflictError when the outlet name already exists in the brand", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION });

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      ConflictError,
    );
  });

  it("throws NotFoundError when the brand does not exist", async () => {
    queryMock.mockRejectedValueOnce({ code: FOREIGN_KEY_VIOLATION });

    await expect(createOutlet(fakePool, CREATE_DATA)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("creates and returns the outlet", async () => {
    queryMock.mockResolvedValueOnce(pgResult([fakeOutletRow()]));

    const result = await createOutlet(fakePool, CREATE_DATA);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO outlets"),
      [CREATE_DATA.name, CREATE_DATA.brandId],
    );
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

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce(pgResult([]));

    await expect(
      updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when the outlet name already exists in the brand", async () => {
    queryMock.mockRejectedValueOnce({ code: UNIQUE_VIOLATION });

    await expect(
      updateOutlet(fakePool, OUTLET_ID, UPDATE_DATA),
    ).rejects.toThrow(ConflictError);
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
