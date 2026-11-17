type NameState = { needsNameConfirmation: boolean };

export const WELCOME_PATH = "/welcome";

export function nameConfirmationRedirect(me: NameState, onWelcomePage: boolean) {
  if (me.needsNameConfirmation && !onWelcomePage) return WELCOME_PATH;
  if (!me.needsNameConfirmation && onWelcomePage) return "/";
  return null;
}

// Only same-origin paths are followed; anything else falls back to the home page
export function safeReturnTo(returnTo: string | undefined) {
  if (!returnTo || !returnTo.startsWith("/")) return "/";
  if (returnTo.startsWith("//") || returnTo.startsWith("/\\")) return "/";
  return returnTo;
}
