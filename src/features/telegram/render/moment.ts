import { toZonedParts } from "../domain";
import type { Instant } from "../domain";
import { SLOT_START_FORMAT, formatClock, instantToUnixSeconds } from "./format";
import { timeTag } from "./html";
import type { Html } from "./htmlType";
import { weekdayName } from "./timeWords";
import type { TimeWords } from "./timeWords";

/** `пт, 16:00`: weekday and local time of one instant, for places without a `tg-time` tag. */
export function formatMoment(instant: Instant, timezone: string, words: TimeWords): string {
  const weekday = weekdayName(words, toZonedParts(instant, timezone).isoWeekday);
  return `${weekday}, ${formatClock(instant, timezone)}`;
}

/** One instant as a `tg-time` tag: readers see it in their own timezone, old clients the user's. */
export function momentHtml(instant: Instant, timezone: string, words: TimeWords): Html {
  return timeTag(instantToUnixSeconds(instant), SLOT_START_FORMAT, formatMoment(instant, timezone, words));
}
