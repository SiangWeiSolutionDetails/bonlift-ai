export type LoginSearch = {
  error?: string;
  returnTo?: string;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// Any error value, even a non-string one, is kept so the page still shows a message for it
export function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  return {
    error: search.error === undefined ? undefined : String(search.error),
    returnTo: optionalString(search.returnTo),
  };
}

export type WelcomeSearch = { returnTo?: string };

export function validateWelcomeSearch(search: Record<string, unknown>): WelcomeSearch {
  return { returnTo: optionalString(search.returnTo) };
}
