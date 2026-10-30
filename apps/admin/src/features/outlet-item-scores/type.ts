import type {
  OutletItemScoreRecordSchemaType,
  OutletItemScoresCalculationQuerySchemaType,
  OutletItemScoresCalculationResponseSchemaType,
  OutletItemScoresRunRecordSchemaType,
  OutletItemScoresRunResultSchemaType,
} from "@ai-services/contracts";

export type OutletItemScoresRun = OutletItemScoresRunRecordSchemaType;
export type OutletItemScore = OutletItemScoreRecordSchemaType;
export type OutletItemScoresRunResult = OutletItemScoresRunResultSchemaType;
export type StartRunInput = OutletItemScoresCalculationQuerySchemaType;
export type StartRunResponse = OutletItemScoresCalculationResponseSchemaType;
