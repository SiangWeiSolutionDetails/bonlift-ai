import type { TFunction } from "i18next";
import { ApiError } from "./api-client";

const TRANSLATED_ERROR_CODES = [
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
  "NETWORK_ERROR",
  "HTTP_ERROR",
] as const;

type TranslatedErrorCode = (typeof TRANSLATED_ERROR_CODES)[number];

function isTranslatedErrorCode(code: string): code is TranslatedErrorCode {
  return TRANSLATED_ERROR_CODES.includes(code as TranslatedErrorCode);
}

export function getErrorMessage(error: unknown, t: TFunction<"common">): string {
  if (error instanceof ApiError) {
    // Unknown codes keep the server's (English) message rather than a vaguer generic one
    return isTranslatedErrorCode(error.code) ? t(`errors.${error.code}`) : error.message;
  }
  return t("errors.UNKNOWN");
}
