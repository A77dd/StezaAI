import { RenderError } from "../errors";

/**
 * Russian plural form for a whole count: 1 день, 2-4 дня, 5-20 дней, 21 день.
 * The teens (11-14) are always the "many" form. Fractions have their own
 * grammar (`1,5 дня`) that this bot never needs, so they are rejected rather
 * than guessed.
 */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(count)) {
    throw new RenderError("Plural count must be a whole number");
  }
  const absolute = Math.abs(count);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** English plural form for a whole count: 1 day, otherwise days (0 days, 2 days). */
export function pluralEn(count: number, one: string, other: string): string {
  if (!Number.isInteger(count)) {
    throw new RenderError("Plural count must be a whole number");
  }
  return Math.abs(count) === 1 ? one : other;
}
