import type { CheckInOutcome, CheckInReason, IntentKind, NotificationIntensity } from "../../domain";
import type { TimeWords } from "../format";

/**
 * All user-visible copy of one locale. Strings are PLAIN text (views escape
 * them); a `{name}` placeholder marks where a view inserts a value (see
 * `template.ts`); functions are for grammar that depends on a number
 * (plurals). Views take a `Catalog`, never a locale name, so adding a locale
 * means adding one object that satisfies this type. The completeness test
 * compares the key sets, kinds and placeholders of every locale.
 *
 * Tone: friendly and short; Russian uses the informal "ты".
 */

export type Catalog = {
  readonly time: TimeWords;
  readonly units: {
    /** `3 дня`. */
    readonly days: (count: number) => string;
    /** `2 блока`. */
    readonly blocks: (count: number) => string;
  };
  readonly common: {
    /** `{text}` in the locale's quotation marks. */
    readonly quoted: string;
    readonly otherTime: string;
    readonly edit: string;
    /** `{label}` marked as the current choice. */
    readonly selected: string;
    readonly tryInline: string;
    /** The query the "try" button types into the input field. */
    readonly tryInlineQuery: string;
    readonly openMiniApp: string;
  };
  readonly welcome: {
    readonly greeting: string;
    /** `{name}`. */
    readonly greetingNamed: string;
    readonly intro: string;
    readonly ways: readonly string[];
    readonly calendarHint: string;
    readonly connectCalendar: string;
  };
  readonly help: {
    readonly title: string;
    readonly items: readonly string[];
    /** `{bot}`: the bot's @username. */
    readonly inlineHint: string;
    readonly commandsTitle: string;
    readonly commands: readonly string[];
    readonly footer: string;
  };
  readonly task: {
    readonly deadline: string;
    readonly estimate: string;
    readonly found: string;
    readonly when: string;
    readonly confirm: string;
    /** Label of the disabled button that keeps a booked card's outcome visible. */
    readonly booked: string;
    readonly copyTime: string;
    readonly bookedFooter: string;
    readonly cancelledNote: string;
    readonly cancelledButton: string;
    readonly noSlotsBeforeDeadline: string;
    /** `{period}`: how far the search looked, e.g. "7 дней". */
    readonly noSlotsHorizon: string;
  };
  readonly forward: {
    /** `{title}`; no `info`: information is asked about, not scheduled. */
    readonly intro: { readonly [K in Exclude<IntentKind, "info">]: string };
    readonly freeTime: string;
    readonly noSlots: string;
    /** `{title}`. */
    readonly info: string;
    readonly remember: string;
    readonly rememberNote: string;
    /** Button that re-interprets the forward as this kind of intent. */
    readonly alternatives: { readonly [K in IntentKind]: string };
    /** `{author}`. */
    readonly sourceFrom: string;
    readonly sourceHidden: string;
  };
  readonly group: {
    readonly chooserTitle: string;
    readonly personal: string;
    readonly team: string;
    readonly remember: string;
    /** The only thing said in the group itself: never any calendar detail. */
    readonly pointer: string;
    readonly openPrivate: string;
    /** For 1, 2 and 3 found windows. */
    readonly found: readonly [string, string, string];
    /** Label of the add-to-calendar button for a slot, e.g. "Добавить ср 16:30". */
    readonly add: (day: string, time: string) => string;
    /** `{group}`. */
    readonly fromGroup: string;
  };
  readonly reminder: {
    /** `{duration}`. */
    readonly startsIn: string;
    readonly startsNow: string;
    readonly when: string;
    readonly footer: string;
    readonly reschedule: string;
  };
  readonly checkIn: {
    readonly questionTitle: string;
    readonly reasonTitle: string;
    readonly outcomes: { readonly [K in CheckInOutcome]: string };
    readonly reasons: { readonly [K in CheckInReason]: string };
    readonly answeredTitle: string;
    readonly outcome: string;
    readonly reason: string;
    readonly recorded: string;
  };
  readonly settings: {
    readonly title: string;
    readonly workingHours: string;
    readonly timezone: string;
    readonly blockLength: string;
    readonly notifications: string;
    readonly calendar: string;
    readonly noWorkingDays: string;
    readonly everyDay: string;
    /** `{days}`, `{from}`, `{to}`. */
    readonly hoursValue: string;
    /** Lower case: shown as a value and capitalised on the button. */
    readonly intensity: { readonly [K in NotificationIntensity]: string };
    readonly calendarConnected: string;
    readonly calendarDisconnected: string;
    readonly connectCalendar: string;
    readonly disconnectCalendar: string;
    readonly changeHours: string;
    readonly openInApp: string;
    readonly footer: string;
  };
  /** Short texts shown as a callback-query alert or a message; plain, at most 200 characters. */
  readonly notices: {
    readonly expired: string;
    readonly alreadyUsed: string;
    /** Unknown button, a button of someone else and a broken one all read the same. */
    readonly unavailable: string;
    readonly unsupportedChat: string;
    readonly slotConflict: string;
    readonly notFound: string;
    readonly transcriptionUnavailable: string;
    readonly intentParserUnavailable: string;
    readonly invalidTimezone: string;
    readonly failure: string;
  };
  readonly inline: {
    readonly slotsTitle: string;
    readonly noSlots: string;
    /** `{title}`. */
    readonly eventTitle: string;
    /** `{title}`. */
    readonly reminderTitle: string;
    readonly when: string;
    readonly withWho: string;
    /** `и ещё 3`. */
    readonly andMore: (count: number) => string;
  };
  readonly agenda: {
    readonly today: string;
    readonly week: string;
    readonly timeColumn: string;
    readonly blockColumn: string;
    readonly emptyToday: string;
    readonly emptyWeek: string;
    /** `{blocks}`, `{duration}`. */
    readonly summary: string;
    /** `{done}`, `{total}`. */
    readonly statuses: string;
    /** `{title}`, `{page}`, `{pages}`: the heading of one page of several. */
    readonly paged: string;
    /** `{day}`: a day heading repeated on the next page. */
    readonly dayContinued: string;
  };
};
