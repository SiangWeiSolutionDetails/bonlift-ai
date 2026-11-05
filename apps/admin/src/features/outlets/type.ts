import type {
  CreateOutletBodySchemaType,
  OutletQuerySchemaType,
  OutletRecordSchemaType,
  UpdateOutletBodySchemaType,
} from "@bonlift-ai/contracts";

export type Outlet = OutletRecordSchemaType;
export type OutletListParams = OutletQuerySchemaType;
export type CreateOutletInput = CreateOutletBodySchemaType;
export type UpdateOutletInput = UpdateOutletBodySchemaType;
