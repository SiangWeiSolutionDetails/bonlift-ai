// A run linked by id in the URL is foreign once it has loaded and belongs outside the workspace brand.
// A run that hasn't loaded, or is only missing from the newest-runs list, is not foreign.
export function isOtherBrandRun(run: { brandId: string } | undefined, brandId: string) {
  return !!run && run.brandId !== brandId;
}

export function isOtherBrandOutletRun(
  run: { outletId: string } | undefined,
  brandOutletIds: string[] | undefined,
) {
  return !!run && !!brandOutletIds && !brandOutletIds.includes(run.outletId);
}
