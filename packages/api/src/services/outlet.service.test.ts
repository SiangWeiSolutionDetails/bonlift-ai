import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../errors.js";
import { genValidUuid } from "../utils/uuid.test-helpers.js";
import { getOutlet } from "./outlet.service.js";

const queryMock = vi.fn();
const fakePool = { query: queryMock } as any;

describe("getOutlet", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("throws ValidationError when the outlet id is invalid", async () => {
    await expect(getOutlet(fakePool, "invalid-outlet-id")).rejects.toThrow(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the outlet does not exist", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(getOutlet(fakePool, genValidUuid())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws NotFoundError when the outlet is inactive", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(getOutlet(fakePool, genValidUuid())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws NotFoundError when the brand of this outlet is inactive", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(getOutlet(fakePool, genValidUuid())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns outlet when outlet id is valid and existed", async () => {
    const outletId = genValidUuid();

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: outletId,
        },
      ],
    });

    const result = await getOutlet(fakePool, outletId);

    expect(result).toEqual({ id: outletId });
  });
});
