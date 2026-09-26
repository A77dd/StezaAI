import { NOTIFICATION_INTENSITIES } from "../../domain";
import type { UserSettings } from "../../domain";
import type { ButtonSpec } from "../buttonSpec";
import { actionButton } from "../buttons";
import { fill, fillPlain } from "../catalog";
import { capitalizeFirst } from "../dayLabel";
import { formatDuration } from "../format";
import type { TimeWords } from "../format";
import { text } from "../html";
import { row } from "../keyboard";
import type { RenderedMessage } from "../rendered";
import { renderMessage } from "../renderMessage";
import type { ViewContext } from "./context";
import { BLOCK_LENGTH_OPTIONS, CALENDAR_CONNECT, CALENDAR_DISCONNECT } from "./settingsValues";
import { compactKeyboard, miniAppButton } from "./shared";

const WEEK_LENGTH = 7;
const MIN_RANGE_DAYS = 3;
const RANGE_DASH = "–";

/** `пн–пт`, `сб, вс`, `пн, ср, пт`: runs of three or more days collapse into a range. */
function formatWorkingDays(isoDays: readonly number[], ctx: ViewContext): string {
  const { settings } = ctx.catalog;
  const words: TimeWords = ctx.catalog.time;
  const days = [...new Set(isoDays)].sort((a, b) => a - b);
  if (days.length === 0) return settings.noWorkingDays;
  if (days.length === WEEK_LENGTH) return settings.everyDay;

  const name = (day: number) => words.weekdaysShort[day - 1];
  const parts: string[] = [];
  let start = 0;
  while (start < days.length) {
    let end = start;
    while (end + 1 < days.length && days[end + 1] === days[end] + 1) end += 1;
    if (end - start + 1 >= MIN_RANGE_DAYS) {
      parts.push(`${name(days[start])}${RANGE_DASH}${name(days[end])}`);
    } else {
      for (let index = start; index <= end; index += 1) parts.push(name(days[index]));
    }
    start = end + 1;
  }
  return parts.join(", ");
}

function markCurrent(label: string, isCurrent: boolean, ctx: ViewContext): string {
  return isCurrent ? fillPlain(ctx.catalog.common.selected, { label }) : label;
}

function calendarButton(settings: UserSettings, ctx: ViewContext): ButtonSpec {
  const copy = ctx.catalog.settings;
  return settings.calendarConnected
    ? actionButton(copy.disconnectCalendar, "settings.toggle", { key: "calendar", value: CALENDAR_DISCONNECT }, "danger")
    : actionButton(copy.connectCalendar, "settings.toggle", { key: "calendar", value: CALENDAR_CONNECT }, "primary");
}

/**
 * The settings screen: current values as facts, and toggle buttons that edit
 * the same message in place. The timezone is shown, not editable by button
 * (there is no `settings.toggle` key for it); the Mini App can change it.
 */
export function settingsView(settings: UserSettings, ctx: ViewContext): RenderedMessage {
  const copy = ctx.catalog.settings;
  const words = ctx.catalog.time;
  const { start, end } = settings.workingHours;

  const hours = fill(copy.hoursValue, {
    days: text(formatWorkingDays(settings.workingHours.isoDays, ctx)),
    from: text(start),
    to: text(end),
  });
  const facts = [
    { label: text(copy.workingHours), value: hours },
    { label: text(copy.timezone), value: text(settings.timezone) },
    { label: text(copy.blockLength), value: text(formatDuration(settings.defaultBlockMinutes, words)) },
    { label: text(copy.notifications), value: text(copy.intensity[settings.notificationIntensity]) },
    {
      label: text(copy.calendar),
      value: text(settings.calendarConnected ? copy.calendarConnected : copy.calendarDisconnected),
    },
  ];

  const intensityRow = NOTIFICATION_INTENSITIES.map((value) =>
    actionButton(
      markCurrent(capitalizeFirst(copy.intensity[value]), value === settings.notificationIntensity, ctx),
      "settings.toggle",
      { key: "notification_intensity", value },
    ),
  );
  const blockRow = BLOCK_LENGTH_OPTIONS.map((minutes) =>
    actionButton(
      markCurrent(formatDuration(minutes, words), minutes === settings.defaultBlockMinutes, ctx),
      "settings.toggle",
      { key: "block_length", value: String(minutes) },
    ),
  );
  const app = miniAppButton(ctx, ctx.catalog.settings.openInApp, "settings");

  return renderMessage({
    title: text(copy.title),
    facts,
    footer: text(copy.footer),
    keyboard: compactKeyboard([
      row(...intensityRow),
      row(...blockRow),
      row(actionButton(copy.changeHours, "settings.toggle", { key: "working_hours" })),
      row(calendarButton(settings, ctx)),
      app === null ? null : row(app),
    ]),
  });
}
