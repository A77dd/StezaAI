/**
 * The vocabulary date and time text is built from, per locale. Each catalog
 * carries one; `RU_TIME_WORDS` is the Russian one. There is deliberately no
 * default: every formatting function takes the words explicitly, so a missing
 * locale is a compile error rather than Russian text in an English message.
 */

type Tuple7 = readonly [string, string, string, string, string, string, string];
type Tuple12 = readonly [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
];

export type TimeWords = {
  /** Monday first. */
  readonly weekdaysShort: Tuple7;
  /** January first. */
  readonly monthsShort: Tuple12;
  readonly minutes: string;
  readonly hours: string;
  readonly today: string;
  readonly tomorrow: string;
  /** A short date such as `12 сент.`; `year` is null for the current year. */
  readonly date: (day: number, month: string, year: number | null) => string;
  /** A deadline date phrase such as `в пт, 12 сент.`. */
  readonly onDate: (weekday: string, date: string) => string;
};

export const RU_TIME_WORDS: TimeWords = {
  weekdaysShort: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  monthsShort: [
    "янв.",
    "февр.",
    "мар.",
    "апр.",
    "мая",
    "июн.",
    "июл.",
    "авг.",
    "сент.",
    "окт.",
    "нояб.",
    "дек.",
  ],
  minutes: "мин",
  hours: "ч",
  today: "сегодня",
  tomorrow: "завтра",
  date: (day, month, year) => (year === null ? `${day} ${month}` : `${day} ${month} ${year}`),
  onDate: (weekday, date) => `в ${weekday}, ${date}`,
};

/** The short name of an ISO weekday (1 = Monday ... 7 = Sunday). */
export function weekdayName(words: TimeWords, isoWeekday: number): string {
  return words.weekdaysShort[isoWeekday - 1];
}

/** The year to print next to a date: null when it is the current year and needs no mention. */
export function yearUnlessCurrent(year: number, currentYear: number): number | null {
  return year === currentYear ? null : year;
}
