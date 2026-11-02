import type {
  CustomerItemScoreRecordSchemaType,
  CustomerItemScoresCalculationQuerySchemaType,
  CustomerItemScoresCalculationResponseSchemaType,
  CustomerItemScoresCustomerListSchemaType,
  CustomerItemScoresCustomerResultSchemaType,
  CustomerItemScoresRunRecordSchemaType,
} from "@ai-services/contracts";

export type CustomerItemScoresRun = CustomerItemScoresRunRecordSchemaType;
export type CustomerItemScore = CustomerItemScoreRecordSchemaType;
export type CustomerListPage = CustomerItemScoresCustomerListSchemaType;
export type CustomerResult = CustomerItemScoresCustomerResultSchemaType;
export type StartRunInput = CustomerItemScoresCalculationQuerySchemaType;
export type StartRunResponse = CustomerItemScoresCalculationResponseSchemaType;
