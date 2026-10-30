import {
  OrderSnapshotCoverageSchema,
  OutletParamsSchema,
  OutletParamsSchemaType,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import { getOrderSnapshotCoverage } from "../services/orderSnapshot.service.js";

export async function orderSnapshotRoutes(app: FastifyInstance) {
  app.get<{ Params: OutletParamsSchemaType }>(
    "/outlets/:outletId/order-snapshots",
    {
      schema: {
        params: OutletParamsSchema,
        response: { 200: OrderSnapshotCoverageSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getOrderSnapshotCoverage(pool, request.params.outletId);
    },
  );
}
