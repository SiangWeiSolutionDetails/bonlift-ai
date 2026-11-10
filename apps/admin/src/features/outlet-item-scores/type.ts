import type {
  OutletItemRoleSchemaType,
  OutletItemScoreRecordSchemaType,
  OutletItemScoresCalculationQuerySchemaType,
  OutletItemScoresCalculationResponseSchemaType,
  OutletItemScoresRunRecordSchemaType,
  OutletItemScoresRunResultSchemaType,
} from "@bonlift-ai/contracts";

export type OutletItemScoresRun = OutletItemScoresRunRecordSchemaType;
export type OutletItemScore = OutletItemScoreRecordSchemaType;
export type OutletItemRole = OutletItemRoleSchemaType;
export type OutletItemScoresRunResult = OutletItemScoresRunResultSchemaType;
export type StartRunInput = OutletItemScoresCalculationQuerySchemaType;
export type StartRunResponse = OutletItemScoresCalculationResponseSchemaType;
