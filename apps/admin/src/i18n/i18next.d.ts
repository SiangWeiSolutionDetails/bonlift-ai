import "i18next";
import type { defaultNS, resources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    // en is the source of truth; the locale parity test keeps the others in line
    resources: (typeof resources)["en"];
  }
}
