import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors.js";
import { assertValidDayparts } from "./dayparts.js";

const daypart = (name: string, start: string, end: string) => ({
  name,
  start,
  end,
});

describe("assertValidDayparts", () => {
  it.each([
    { label: "an empty list", dayparts: [] },
    {
      label: "dayparts that only touch",
      dayparts: [
        daypart("breakfast", "07:00", "11:00"),
        daypart("lunch", "11:00", "14:00"),
      ],
    },
    {
      label: "dayparts with a gap between them",
      dayparts: [
        daypart("lunch", "11:00", "14:00"),
        daypart("dinner", "17:00", "21:00"),
      ],
    },
    {
      label: "a daypart crossing midnight next to its neighbours",
      dayparts: [
        daypart("dinner", "17:00", "22:00"),
        daypart("supper", "22:00", "02:00"),
        daypart("breakfast", "06:00", "11:00"),
      ],
    },
    {
      label: "a daypart ending exactly at midnight",
      dayparts: [daypart("supper", "21:00", "00:00")],
    },
    {
      label: "dayparts given out of order",
      dayparts: [
        daypart("dinner", "17:00", "21:00"),
        daypart("breakfast", "07:00", "11:00"),
      ],
    },
  ])("accepts $label", ({ dayparts }) => {
    expect(() => assertValidDayparts(dayparts)).not.toThrow();
  });

  it.each([
    {
      label: "a duplicate name",
      dayparts: [
        daypart("lunch", "11:00", "14:00"),
        daypart("lunch", "17:00", "21:00"),
      ],
      message: "Daypart lunch is defined more than once.",
    },
    {
      label: "the reserved all_day name",
      dayparts: [daypart("all_day", "00:00", "12:00")],
      message: "Daypart name all_day is reserved for the whole day.",
    },
    {
      label: "the same start and end",
      dayparts: [daypart("brunch", "10:00", "10:00")],
      message: "Daypart brunch must have different start and end times.",
    },
    {
      label: "overlapping dayparts",
      dayparts: [
        daypart("lunch", "11:00", "14:00"),
        daypart("tea", "13:30", "17:00"),
      ],
      message: "Dayparts lunch and tea overlap.",
    },
    {
      label: "a daypart inside another",
      dayparts: [
        daypart("day", "08:00", "20:00"),
        daypart("lunch", "11:00", "14:00"),
      ],
      message: "Dayparts day and lunch overlap.",
    },
    {
      label: "an overlap after midnight",
      dayparts: [
        daypart("supper", "22:00", "02:00"),
        daypart("late", "01:00", "05:00"),
      ],
      message: "Dayparts supper and late overlap.",
    },
    {
      label: "an overlap before midnight",
      dayparts: [
        daypart("supper", "22:00", "02:00"),
        daypart("dinner", "18:00", "23:00"),
      ],
      message: "Dayparts dinner and supper overlap.",
    },
  ])("rejects $label", ({ dayparts, message }) => {
    expect(() => assertValidDayparts(dayparts)).toThrow(
      new ValidationError(message),
    );
  });
});
