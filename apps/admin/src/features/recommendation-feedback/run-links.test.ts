import { describe, expect, it } from "vitest";
import { serveRunLinks, shortRunId } from "./run-links";
import type { ServeLogEntry } from "./type";

const BRAND_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "33333333-aaaa-3333-3333-333333333333";
const CUSTOMER_RUN_ID = "44444444-bbbb-4444-4444-444444444444";
const AFFINITY_RUN_ID = "55555555-cccc-5555-5555-555555555555";

function serve(runs: Partial<ServeLogEntry["runs"]> = {}): ServeLogEntry {
  return {
    id: "66666666-6666-6666-6666-666666666666",
    servedAt: "2026-11-02T03:04:05.000Z",
    outletId: OUTLET_ID,
    outletName: "Boat Quay",
    channelCode: null,
    daypart: "lunch",
    items: [],
    runs: { outletScores: null, customerScores: null, itemAffinity: null, ...runs },
  };
}

describe("serveRunLinks", () => {
  it("links each run to its page with the brand, outlet and run selected", () => {
    const links = serveRunLinks(
      BRAND_ID,
      serve({
        outletScores: { runId: RUN_ID, available: true },
        customerScores: { runId: CUSTOMER_RUN_ID, available: true },
        itemAffinity: { runId: AFFINITY_RUN_ID, available: true },
      }),
    );

    expect(links.map((link) => link.target)).toEqual([
      { to: "/results", search: { brandId: BRAND_ID, outletId: OUTLET_ID, runId: RUN_ID } },
      { to: "/customer-scores", search: { brandId: BRAND_ID, runId: CUSTOMER_RUN_ID } },
      { to: "/item-affinity", search: { brandId: BRAND_ID, runId: AFFINITY_RUN_ID } },
    ]);
  });

  it("skips the sources the serve did not use", () => {
    const links = serveRunLinks(BRAND_ID, serve({ customerScores: { runId: CUSTOMER_RUN_ID, available: true } }));

    expect(links.map((link) => [link.type, link.runId])).toEqual([["customerScores", CUSTOMER_RUN_ID]]);
  });

  it("keeps a run that is no longer available, marked as such", () => {
    const links = serveRunLinks(BRAND_ID, serve({ outletScores: { runId: RUN_ID, available: false } }));

    expect(links).toMatchObject([{ type: "outletScores", runId: RUN_ID, available: false }]);
  });

  it("returns no links when the serve used no run", () => {
    expect(serveRunLinks(BRAND_ID, serve())).toEqual([]);
  });
});

describe("shortRunId", () => {
  it("keeps the first 8 characters", () => {
    expect(shortRunId(RUN_ID)).toBe("33333333");
  });
});
