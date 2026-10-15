import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Type, { Static } from "typebox";
import { NotFoundError, ValidationError } from "../errors.js";

// Resolves to packages/api/mock-datasets from both src/routes (tsx) and dist/routes (build).
const datasetDir = new URL("../../mock-datasets/", import.meta.url);

// The pattern blocks path traversal (e.g. "../../.env") before the name reaches the filesystem.
const MockDatasetParamsSchema = Type.Object({
  name: Type.String({ pattern: "^[A-Za-z0-9_-]{1,64}$" }),
});
type MockDatasetParamsSchemaType = Static<typeof MockDatasetParamsSchema>;

async function readDatasetFile(name: string): Promise<string> {
  try {
    return await readFile(
      fileURLToPath(new URL(`${name}.json`, datasetDir)),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(`Mock dataset "${name}" not found`);
    }
    throw error;
  }
}

function parseDataset(name: string, raw: string): unknown {
  try {
    // SSMS exports are saved with a UTF-8 BOM, which JSON.parse rejects.
    return JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    throw new ValidationError(`Mock dataset "${name}" is not valid JSON`);
  }
}

export async function mockDatasetRoutes(app: FastifyInstance) {
  app.get<{ Params: MockDatasetParamsSchemaType }>(
    "/mock-dataset/:name",
    {
      schema: {
        params: MockDatasetParamsSchema,
      },
    },
    async (request) => {
      const { name } = request.params;
      const raw = await readDatasetFile(name);
      return parseDataset(name, raw);
    },
  );
}
