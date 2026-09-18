import { randomUUID } from "node:crypto";

export function genValidUuid(): string {
  return randomUUID();
}
