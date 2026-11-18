import type {
  BrandDetailSchemaType,
  BrandQuerySchemaType,
  BrandRecordSchemaType,
  CreateBrandBodySchemaType,
  UpdateBrandBodySchemaType,
} from '@bonlift-ai/contracts'

export type Brand = BrandRecordSchemaType
export type BrandDetail = BrandDetailSchemaType
export type BrandListParams = BrandQuerySchemaType
export type CreateBrandInput = CreateBrandBodySchemaType
export type UpdateBrandInput = UpdateBrandBodySchemaType
