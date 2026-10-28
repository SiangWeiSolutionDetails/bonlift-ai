import {
  ALL_DAY_DAYPART,
  findDaypartIssue,
  type DaypartIssue,
  type DaypartSchemaType,
} from "@ai-services/contracts";
import { ValidationError } from "../errors.js";

function toMessage(issue: DaypartIssue): string {
  switch (issue.code) {
    case "reservedName":
      return `Daypart name ${ALL_DAY_DAYPART} is reserved for the whole day.`;
    case "sameStartEnd":
      return `Daypart ${issue.name} must have different start and end times.`;
    case "duplicateName":
      return `Daypart ${issue.name} is defined more than once.`;
    case "overlap":
      return `Dayparts ${issue.first} and ${issue.second} overlap.`;
  }
}

export function assertValidDayparts(dayparts: DaypartSchemaType[]) {
  const issue = findDaypartIssue(dayparts);
  if (issue) throw new ValidationError(toMessage(issue));
}
