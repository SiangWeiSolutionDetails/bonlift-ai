import {
  DatasetResultSchema,
  DatasetSchema,
  DatasetSchemaType,
  OutletParamsSchema,
  OutletParamsSchemaType,
} from "@ai-services/contracts";
import { getPool } from "@ai-services/db";
import { FastifyInstance } from "fastify";
import { storeOrderSnapshots } from "../services/orderSnapshot.service.js";

export async function datasetRoutes(app: FastifyInstance) {
  app.post<{ Params: OutletParamsSchemaType; Body: DatasetSchemaType }>(
    "/outlets/:outletId/dataset",
    {
      bodyLimit: 15 * 1024 * 1024,
      schema: {
        params: OutletParamsSchema,
        body: DatasetSchema,
        response: { 200: DatasetResultSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return storeOrderSnapshots(pool, request.params.outletId, request.body);
    },
  );
}
