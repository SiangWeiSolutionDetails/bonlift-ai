interface PgErrorLike {
  code?: string;
  constraint?: string;
}

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
export const CHECK_VIOLATION = "23514";

export function isUniqueViolation(err: unknown): boolean {
  return (err as PgErrorLike)?.code === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (err as PgErrorLike)?.code === FOREIGN_KEY_VIOLATION;
}

export function isUniqueViolationOf(err: unknown, constraint: string): boolean {
  return (
    isUniqueViolation(err) && (err as PgErrorLike)?.constraint === constraint
  );
}

export function isCheckViolationOf(err: unknown, constraint: string): boolean {
  return (
    (err as PgErrorLike)?.code === CHECK_VIOLATION && (err as PgErrorLike)?.constraint === constraint
  );
}
