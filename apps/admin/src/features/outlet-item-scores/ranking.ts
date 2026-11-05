import { ALL_DAY_DAYPART } from "@bonlift-ai/contracts";
import type { OutletItemScore, OutletItemScoresRun } from "./type";

export function groupByDaypart(items: OutletItemScore[]) {
  const groups = new Map<string, OutletItemScore[]>();
  for (const item of items) {
    const group = groups.get(item.daypart);
    if (group) group.push(item);
    else groups.set(item.daypart, [item]);
  }
  return groups;
}

// Config order first (breakfast before dinner), then any daypart the config no longer lists.
export function orderDayparts(run: OutletItemScoresRun, dayparts: string[]) {
  const configured = run.dayparts.length
    ? run.dayparts.map((daypart) => daypart.name)
    : [ALL_DAY_DAYPART];
  const present = new Set(dayparts);
  return [
    ...configured.filter((name) => present.has(name)),
    ...dayparts.filter((name) => !configured.includes(name)),
  ];
}
