import {
  BrandParamsSchema,
  BrandParamsSchemaType,
  CustomerItemScoresCustomerListQuerySchema,
  CustomerItemScoresCustomerListQuerySchemaType,
  CustomerItemScoresCustomerListSchema,
  CustomerItemScoresCustomerParamsSchema,
  CustomerItemScoresCustomerParamsSchemaType,
  CustomerItemScoresCustomerResultSchema,
  CustomerItemScoresCustomerSearchBodySchema,
  CustomerItemScoresCustomerSearchBodySchemaType,
  CustomerItemScoresRunListQuerySchema,
  CustomerItemScoresRunListQuerySchemaType,
  CustomerItemScoresRunListSchema,
  CustomerItemScoresRunRecordSchema,
  PublishCustomerItemScoresRunBodySchema,
  PublishCustomerItemScoresRunBodySchemaType,
  RunParamsSchema,
  RunParamsSchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { readCustomerIdSecret } from "../config/env.js";
import {
  getCustomerItemScoresCustomerResult,
  getCustomerItemScoresCustomers,
  getCustomerItemScoresRuns,
  publishCustomerItemScoresRun,
  searchCustomerItemScoresCustomer,
} from "../services/customerItemScoresResult.service.js";

export async function customerItemScoresResultRoutes(app: FastifyInstance) {
  app.get<{
    Params: BrandParamsSchemaType;
    Querystring: CustomerItemScoresRunListQuerySchemaType;
  }>(
    "/brands/:brandId/runs/customer-item-scores",
    {
      schema: {
        params: BrandParamsSchema,
        querystring: CustomerItemScoresRunListQuerySchema,
        response: { 200: CustomerItemScoresRunListSchema },
      },
    },
    async (request) => {
      const pool = getPool();
      const runs = await getCustomerItemScoresRuns(
        pool,
        request.params.brandId,
        request.query,
      );
      return { runs };
    },
  );

  // PUT: the resource is the brand's live-run pointer, and publishing the same run again changes nothing.
  app.put<{
    Params: BrandParamsSchemaType;
    Body: PublishCustomerItemScoresRunBodySchemaType;
  }>(
    "/brands/:brandId/published-runs/customer-item-scores",
    {
      schema: {
        params: BrandParamsSchema,
        body: PublishCustomerItemScoresRunBodySchema,
        response: { 200: CustomerItemScoresRunRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return publishCustomerItemScoresRun(
        pool,
        request.params.brandId,
        request.body,
      );
    },
  );

  app.get<{
    Params: RunParamsSchemaType;
    Querystring: CustomerItemScoresCustomerListQuerySchemaType;
  }>(
    "/runs/:runId/customer-item-scores/customers",
    {
      schema: {
        params: RunParamsSchema,
        querystring: CustomerItemScoresCustomerListQuerySchema,
        response: { 200: CustomerItemScoresCustomerListSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getCustomerItemScoresCustomers(pool, request.params.runId, request.query);
    },
  );

  app.post<{
    Params: RunParamsSchemaType;
    Body: CustomerItemScoresCustomerSearchBodySchemaType;
  }>(
    "/runs/:runId/customer-item-scores/customers/search",
    {
      schema: {
        params: RunParamsSchema,
        body: CustomerItemScoresCustomerSearchBodySchema,
        response: { 200: CustomerItemScoresCustomerListSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return searchCustomerItemScoresCustomer(
        pool,
        request.params.runId,
        request.body,
        readCustomerIdSecret(),
      );
    },
  );

  app.get<{ Params: CustomerItemScoresCustomerParamsSchemaType }>(
    "/runs/:runId/customer-item-scores/customers/:customerId",
    {
      schema: {
        params: CustomerItemScoresCustomerParamsSchema,
        response: { 200: CustomerItemScoresCustomerResultSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return getCustomerItemScoresCustomerResult(
        pool,
        request.params.runId,
        request.params.customerId,
      );
    },
  );
}
