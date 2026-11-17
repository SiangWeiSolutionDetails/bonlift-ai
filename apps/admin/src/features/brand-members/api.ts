import { apiRequest } from "@/lib/api-client";
import type { AddBrandMemberInput, BrandMember } from "./type";

const membersPath = (brandId: string) => `/brands/${encodeURIComponent(brandId)}/members`;

export async function listBrandMembers(brandId: string, signal: AbortSignal) {
  return await apiRequest<BrandMember[]>(membersPath(brandId), { signal });
}

export async function addBrandMember(brandId: string, input: AddBrandMemberInput) {
  return await apiRequest<BrandMember>(membersPath(brandId), { method: "POST", body: input });
}
