import {
  DatasetResultSchema,
  DatasetSchema,
  DatasetSchemaType,
  OrderSnapshotCoverageSchema,
  OrderSnapshotParamsSchema,
  OrderSnapshotParamsSchemaType,
  OutletParamsSchema,
  OutletParamsSchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { readCustomerIdSecret } from "../config/env.js";
import {
  getOrderSnapshot,
  getOrderSnapshotCoverage,
  storeOrderSnapshots,
} from "../services/orderSnapshot.service.js";

export async function orderSnapshotRoutes(app: FastifyInstance) {
  app.post<{ Params: OutletParamsSchemaType; Body: DatasetSchemaType }>(
    "/outlets/:outletId/order-snapshots",
    {
      bodyLimit: 15 * 1024 * 1024,
      config: { access: { brand: "snapshots.upload", from: "params.outletId" } },
      schema: {
        params: OutletParamsSchema,
        body: DatasetSchema,
        response: { 200: DatasetResultSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return storeOrderSnapshots(pool, request.params.outletId, request.body, readCustomerIdSecret());
    },
  );

  app.get<{ Params: OutletParamsSchemaType }>(
    "/outlets/:outletId/order-snapshots",
    {
      config: { access: { brand: "snapshots.view", from: "params.outletId" } },
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
      config: { access: { brand: "snapshots.viewCustomerIds", from: "params.outletId" } },
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
