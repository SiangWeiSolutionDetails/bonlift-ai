interface PgErrorLike {
  code?: string;
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export function isUniqueViolation(err: unknown): boolean {
  return (err as PgErrorLike)?.code === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (err as PgErrorLike)?.code === FOREIGN_KEY_VIOLATION;
}
