import { apiRequest } from "@/lib/api-client";
import type { AddBrandUserInput, BrandUser } from "./type";

const brandUsersPath = (brandId: string) => `/brands/${encodeURIComponent(brandId)}/users`;

export async function listBrandUsers(brandId: string, signal: AbortSignal) {
  return await apiRequest<BrandUser[]>(brandUsersPath(brandId), { signal });
}

export async function addBrandUser(brandId: string, input: AddBrandUserInput) {
  return await apiRequest<BrandUser>(brandUsersPath(brandId), { method: "POST", body: input });
}
