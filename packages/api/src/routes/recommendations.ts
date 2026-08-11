import type { FastifyInstance } from "fastify";

const paramsSchema = {
  type: "object",
  required: ["outletId"],
  properties: {
    outletId: { type: "string" },
  },
} as const;

const responseSchema = {
  200: {
    type: "object",
    properties: {
      outletId: { type: "string" },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            refId: { type: "string" },
            itemName: { type: "string" },
            category: { type: "string" },
            score: { type: "number" },
          },
          required: ["refId", "itemName", "category", "score"],
        },
      },
    },
    required: ["outletId", "recommendations"],
  },
} as const;

export async function recommendationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { outletId: string } }>(
    "/outlets/:outletId/recommendations",
    { schema: { params: paramsSchema, response: responseSchema } },
    async (request, reply) => {
      // TODO(Task 12): read from outlet_item_scores via getPool(), throw NotFoundError
      // if the outlet doesn't exist, return { outletId, recommendations } on success.
      throw new Error("not implemented — see Task 12");
    }
  );
}
