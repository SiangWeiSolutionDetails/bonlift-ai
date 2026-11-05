import type {
  ItemAffinityCalculationQuerySchemaType,
  ItemAffinityCalculationResponseSchemaType,
  ItemAffinityItemListSchemaType,
  ItemAffinityItemRecordSchemaType,
  ItemAffinityItemResultSchemaType,
  ItemAffinityPartnerRecordSchemaType,
  ItemAffinityRunRecordSchemaType,
} from "@bonlift-ai/contracts";

export type ItemAffinityRun = ItemAffinityRunRecordSchemaType;
export type AffinityItem = ItemAffinityItemRecordSchemaType;
export type AffinityItemList = ItemAffinityItemListSchemaType;
export type AffinityItemResult = ItemAffinityItemResultSchemaType;
export type AffinityPartner = ItemAffinityPartnerRecordSchemaType;
export type StartRunInput = ItemAffinityCalculationQuerySchemaType;
export type StartRunResponse = ItemAffinityCalculationResponseSchemaType;
