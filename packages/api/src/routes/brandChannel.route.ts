import {
  BrandChannelListSchema,
  BrandChannelParamsSchema,
  BrandChannelParamsSchemaType,
  BrandChannelRecordSchema,
  BrandParamsSchema,
  BrandParamsSchemaType,
  UpdateBrandChannelBodySchema,
  UpdateBrandChannelBodySchemaType,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import {
  listBrandChannels,
  updateBrandChannel,
} from "../services/brandChannel.service.js";

// The channel list itself only changes through migrations; a brand can only switch each channel on or off.
export async function brandChannelRoutes(app: FastifyInstance) {
  app.get<{ Params: BrandParamsSchemaType }>(
    "/brands/:brandId/channels",
    {
      schema: {
        params: BrandParamsSchema,
        response: { 200: BrandChannelListSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return listBrandChannels(pool, request.params.brandId);
    },
  );

  app.put<{
    Params: BrandChannelParamsSchemaType;
    Body: UpdateBrandChannelBodySchemaType;
  }>(
    "/brands/:brandId/channels/:channelId",
    {
      schema: {
        params: BrandChannelParamsSchema,
        body: UpdateBrandChannelBodySchema,
        response: { 200: BrandChannelRecordSchema },
      },
    },
    (request) => {
      const pool = getPool();
      return updateBrandChannel(
        pool,
        request.params.brandId,
        request.params.channelId,
        request.body,
      );
    },
  );
}
