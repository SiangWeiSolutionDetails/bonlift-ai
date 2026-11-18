import {
  RecommendationFeedbackBodySchema,
  RecommendationFeedbackBodySchemaType,
  RecommendationFeedbackErrorResponseSchema,
  RecommendationFeedbackResponseSchema,
  ServingErrorResponseSchemas,
} from "@bonlift-ai/contracts";
import { getPool } from "@bonlift-ai/db";
import { FastifyInstance } from "fastify";
import { readCustomerIdSecret } from "../config/env.js";
import { recordRecommendationFeedback } from "../services/recommendationFeedback.service.js";

const FEEDBACK_DESCRIPTION =
  "Tells us what a customer did with an item. Send `accepted` when the customer adds a suggested item to the cart " +
  "and `rejected` when they dismiss it: one call per action.\n\n" +
  "The customer's preference is always recorded for your brand, whether or not you send a `recommendationId`. A " +
  "rejected item is not returned to that customer by `POST /v1/recommendations` or `POST /v1/item-affinity` for the " +
  "brand's rejection window, and accepting it later lifts that. Other customers and anonymous requests are not " +
  "affected.\n\n" +
  "Send the `recommendationId` of the recommendations or item affinity response the item was in, when there was one, " +
  "so the feedback is also counted for that response. It is only counted within the brand's feedback window (2 hours " +
  "by default) and only for an item that was in that response; otherwise only the preference is recorded. Items of " +
  "a response you send no feedback for count as ignored by the customer. So request a `limit` equal to the number of " +
  "items you display, and pass the items available right now in `include`, so that every returned item is one the " +
  "customer could see.\n\n" +
  "Only identified customers can give feedback: a missing, blank or malformed `customerId` is rejected with 400 and " +
  "nothing is recorded.\n\n" +
  "A valid request always gets 202 with no body, whether or not the feedback matched a response. Retries are safe: " +
  "the same feedback is only counted once. Call this from your server, never from the customer's device, so your API " +
  "key is never exposed.";

export async function feedbackRoutes(app: FastifyInstance) {
  app.post<{ Body: RecommendationFeedbackBodySchemaType }>(
    "/feedback",
    {
      schema: {
        summary: "Feedback on an item",
        description: FEEDBACK_DESCRIPTION,
        tags: ["Recommendations"],
        body: RecommendationFeedbackBodySchema,
        response: {
          202: RecommendationFeedbackResponseSchema,
          ...ServingErrorResponseSchemas,
          500: RecommendationFeedbackErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const pool = getPool();
      // A database error is not swallowed here, unlike recommendations: the caller retries, and the write is idempotent.
      await recordRecommendationFeedback(
        pool,
        request.servingBrandId as string,
        request.body,
        readCustomerIdSecret(),
      );
      return reply.status(202).send();
    },
  );
}
