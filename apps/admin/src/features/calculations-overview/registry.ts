import type { ParseKeys } from "i18next";
import type { CustomerScoresSearch } from "@/features/customer-item-scores/search";
import type { ItemAffinitySearch } from "@/features/item-affinity/search";
import type { ResultsSearch } from "@/features/outlet-item-scores/search";
import type { CalculationEntry, CalculationJobType } from "./type";

type CalculationsKey = ParseKeys<"calculations">;

type BrandParams = { brandId: string };

export type CalculationDetailsTarget =
  | { to: "/b/$brandId/results"; params: BrandParams; search: ResultsSearch }
  | { to: "/b/$brandId/customer-scores"; params: BrandParams; search: CustomerScoresSearch }
  | { to: "/b/$brandId/item-affinity"; params: BrandParams; search: ItemAffinitySearch };

// Set to open the page on one run instead of the default (published) one
export type DetailsLink = { runId?: string; outletId?: string };

export type CalculationDefinition = {
  jobType: CalculationJobType;
  titleKey: CalculationsKey;
  metricsLabelKey: { subjects: CalculationsKey; rows: CalculationsKey };
  details: (brandId: string, link?: DetailsLink) => CalculationDetailsTarget;
};

// Display order of the cards. A new calculation is one entry here plus its translations.
export const CALCULATIONS: CalculationDefinition[] = [
  {
    jobType: "outlet_item_scores",
    titleKey: "jobs.outletItemScores.title",
    metricsLabelKey: {
      subjects: "jobs.outletItemScores.subjects",
      rows: "jobs.outletItemScores.rows",
    },
    details: (brandId, link) => ({ to: "/b/$brandId/results", params: { brandId }, search: { ...link } }),
  },
  {
    jobType: "customer_item_scores",
    titleKey: "jobs.customerItemScores.title",
    metricsLabelKey: {
      subjects: "jobs.customerItemScores.subjects",
      rows: "jobs.customerItemScores.rows",
    },
    details: (brandId, link) => ({
      to: "/b/$brandId/customer-scores",
      params: { brandId },
      search: { runId: link?.runId },
    }),
  },
  {
    jobType: "item_affinity",
    titleKey: "jobs.itemAffinity.title",
    metricsLabelKey: {
      subjects: "jobs.itemAffinity.subjects",
      rows: "jobs.itemAffinity.rows",
    },
    details: (brandId, link) => ({
      to: "/b/$brandId/item-affinity",
      params: { brandId },
      search: { runId: link?.runId },
    }),
  },
];

export type RegisteredCalculation = {
  definition: CalculationDefinition;
  entry: CalculationEntry;
};

// Registry order wins; job types the admin doesn't know yet, and registry entries the API didn't send, are dropped.
export function joinCalculations(
  entries: CalculationEntry[],
  registry: CalculationDefinition[] = CALCULATIONS,
): RegisteredCalculation[] {
  return registry.flatMap((definition) => {
    const entry = entries.find((candidate) => candidate.jobType === definition.jobType);
    return entry ? [{ definition, entry }] : [];
  });
}

export function findDefinition(jobType: string, registry: CalculationDefinition[] = CALCULATIONS) {
  return registry.find((definition) => definition.jobType === jobType);
}
