import { apiRequest } from "@/lib/api-client";
import type {
  CustomerItemScoresRun,
  CustomerListPage,
  CustomerResult,
  StartRunInput,
  StartRunResponse,
} from "./type";

export async function listCustomerItemScoresRuns(
  brandId: string,
  signal: AbortSignal,
) {
  const data = await apiRequest<{ runs: CustomerItemScoresRun[] }>(
    `/brands/${encodeURIComponent(brandId)}/runs/customer-item-scores`,
    { signal },
  );
  return data.runs;
}

export async function publishCustomerItemScoresRun(
  brandId: string,
  runId: string,
) {
  return apiRequest<CustomerItemScoresRun>(
    `/brands/${encodeURIComponent(brandId)}/published-runs/customer-item-scores`,
    { method: "PUT", body: { runId } },
  );
}

export async function startCustomerItemScoresRun(
  brandId: string,
  input: StartRunInput,
) {
  return apiRequest<StartRunResponse>(
    `/calculate/customer-item-scores/${encodeURIComponent(brandId)}`,
    { method: "POST", query: input },
  );
}

export async function listRunCustomers(
  runId: string,
  params: { after?: string; search?: string },
  signal: AbortSignal,
) {
  return apiRequest<CustomerListPage>(
    `/runs/${encodeURIComponent(runId)}/customer-item-scores/customers`,
    { query: params, signal },
  );
}

export async function getRunCustomer(
  runId: string,
  customerId: string,
  signal: AbortSignal,
) {
  return apiRequest<CustomerResult>(
    `/runs/${encodeURIComponent(runId)}/customer-item-scores/customers/${encodeURIComponent(customerId)}`,
    { signal },
  );
}
