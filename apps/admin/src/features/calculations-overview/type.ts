import type {
  BrandCalculationsStartedRunSchemaType,
  BrandCalculationsStartResponseSchemaType,
  CalculationJobTypeSchemaType,
  CalculationOverviewEntrySchemaType,
  CalculationOverviewOutletSchemaType,
  CalculationOverviewRunSchemaType,
  CalculationOverviewTopItemSchemaType,
  CalculationOverviewTopPairSchemaType,
  CalculationsOverviewSchemaType,
} from "@bonlift-ai/contracts";

export type CalculationJobType = CalculationJobTypeSchemaType;
export type CalculationsOverview = CalculationsOverviewSchemaType;
export type CalculationEntry = CalculationOverviewEntrySchemaType;
export type CalculationOutlet = CalculationOverviewOutletSchemaType;
export type CalculationRun = CalculationOverviewRunSchemaType;
export type CalculationRunStatus = CalculationRun["status"];
export type TopPair = CalculationOverviewTopPairSchemaType;
export type TopItem = CalculationOverviewTopItemSchemaType;
export type StartedRun = BrandCalculationsStartedRunSchemaType;
export type StartAllResponse = BrandCalculationsStartResponseSchemaType;
