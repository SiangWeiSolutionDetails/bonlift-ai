import {
  DatasetSchema,
  OrderSnapshotCoverageSchema,
  OrderSnapshotParamsSchema,
  OrderSnapshotParamsSchemaType,
  OutletParamsSchema,
  OutletParamsSchemaType,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import {
  getOrderSnapshot,
  getOrderSnapshotCoverage,
} from "../services/orderSnapshot.service.js";

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

  app.get<{ Params: OrderSnapshotParamsSchemaType }>(
    "/outlets/:outletId/order-snapshots/:date",
    {
      schema: {
        params: OrderSnapshotParamsSchema,
        response: { 200: DatasetSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getOrderSnapshot(pool, request.params.outletId, request.params.date);
    },
  );
}
