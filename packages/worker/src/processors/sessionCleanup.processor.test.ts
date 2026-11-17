import { describe, expect, it, vi } from "vitest";
import { deleteExpiredSessions } from "./sessionCleanup.processor.js";

describe("deleteExpiredSessions", () => {
  it("deletes sessions past their expiry or idle limit with the idle interval bound as a parameter", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 3 });

    await deleteExpiredSessions({ query });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM user_sessions/);
    expect(sql).toMatch(/expires_at < now\(\)/);
    expect(sql).toMatch(/last_seen_at < now\(\) - \$1::interval/);
    expect(params).toEqual(["8 hours"]);
  });

  it("returns the number of deleted sessions", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 5 });

    await expect(deleteExpiredSessions({ query })).resolves.toBe(5);
  });

  it("returns 0 when the driver reports no rowCount", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: null });

    await expect(deleteExpiredSessions({ query })).resolves.toBe(0);
  });
});
