import { apiRequest } from "@/lib/api-client";
import type {
  CreateOutletInput,
  Outlet,
  OutletListParams,
  UpdateOutletInput,
} from "./type";

export async function listOutlets(
  params: OutletListParams,
  signal?: AbortSignal,
) {
  const data = await apiRequest<{ outlets: Outlet[] }>("/outlets", {
    query: params,
    signal,
  });
  return data.outlets;
}

export async function getOutlet(outletId: string, signal?: AbortSignal) {
  return await apiRequest<Outlet>(`/outlets/${encodeURIComponent(outletId)}`, {
    signal,
  });
}

export async function createOutlet(input: CreateOutletInput) {
  return await apiRequest<Outlet>("/outlets", { method: "POST", body: input });
}

export async function deleteOutlet(outletId: string) {
  return await apiRequest<void>(`/outlets/${encodeURIComponent(outletId)}`, {
    method: "DELETE",
  });
}

export async function updateOutlet(outletId: string, input: UpdateOutletInput) {
  return await apiRequest<Outlet>(`/outlets/${encodeURIComponent(outletId)}`, {
    method: "PATCH",
    body: input,
  });
}
