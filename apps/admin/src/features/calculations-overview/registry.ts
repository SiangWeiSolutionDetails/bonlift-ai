import type { ParseKeys } from "i18next";
import type { CustomerScoresSearch } from "@/features/customer-item-scores/search";
import type { ItemAffinitySearch } from "@/features/item-affinity/search";
import type { ResultsSearch } from "@/features/outlet-item-scores/search";
import type { CalculationEntry, CalculationJobType } from "./type";

type CalculationsKey = ParseKeys<"calculations">;

export type CalculationDetailsTarget =
  | { to: "/results"; search: ResultsSearch }
  | { to: "/customer-scores"; search: CustomerScoresSearch }
  | { to: "/item-affinity"; search: ItemAffinitySearch };

export type CalculationDefinition = {
  jobType: CalculationJobType;
  titleKey: CalculationsKey;
  descriptionKey: CalculationsKey;
  metricsLabelKey: { subjects: CalculationsKey; rows: CalculationsKey };
  details: (brandId: string) => CalculationDetailsTarget;
};

// Display order of the cards. A new calculation is one entry here plus its translations.
export const CALCULATIONS: CalculationDefinition[] = [
  {
    jobType: "outlet_item_scores",
    titleKey: "jobs.outletItemScores.title",
    descriptionKey: "jobs.outletItemScores.description",
    metricsLabelKey: {
      subjects: "jobs.outletItemScores.subjects",
      rows: "jobs.outletItemScores.rows",
    },
    details: (brandId) => ({ to: "/results", search: { brandId } }),
  },
  {
    jobType: "customer_item_scores",
    titleKey: "jobs.customerItemScores.title",
    descriptionKey: "jobs.customerItemScores.description",
    metricsLabelKey: {
      subjects: "jobs.customerItemScores.subjects",
      rows: "jobs.customerItemScores.rows",
    },
    details: (brandId) => ({ to: "/customer-scores", search: { brandId } }),
  },
  {
    jobType: "item_affinity",
    titleKey: "jobs.itemAffinity.title",
    descriptionKey: "jobs.itemAffinity.description",
    metricsLabelKey: {
      subjects: "jobs.itemAffinity.subjects",
      rows: "jobs.itemAffinity.rows",
    },
    details: (brandId) => ({ to: "/item-affinity", search: { brandId } }),
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
