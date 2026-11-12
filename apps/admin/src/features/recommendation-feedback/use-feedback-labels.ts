import { useTranslation } from "react-i18next";
import { ALL_DAY_DAYPART } from "@bonlift-ai/contracts";
import { formatDateTime } from "@/lib/date-format";
import { isKnownReason } from "./feedback";
import type { FeedbackRunRow } from "./type";

// Reasons and dayparts arrive as raw keys; unknown ones (a reason added later, a configured daypart name) show as is.
export function useFeedbackLabels() {
  const { t } = useTranslation("recommendationFeedback");

  return {
    reasonLabel: (reason: string) => (isKnownReason(reason) ? t(`reasons.${reason}`) : reason),
    daypartLabel: (daypart: string) =>
      daypart === ALL_DAY_DAYPART ? t("dayparts.allDay") : daypart,
    // The short run id is shown next to it by RunName.
    runLabel: (run: FeedbackRunRow) =>
      `${t(`runs.jobTypes.${run.jobType}`)} · ${
        run.runAvailable && run.runAt ? formatDateTime(run.runAt) : t("runs.unavailable")
      }`,
  };
}
