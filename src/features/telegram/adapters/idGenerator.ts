import type { IdGenerator } from "../domain";

const PREFIX_PATTERN = /^[a-z][a-z0-9_]*$/;

function assertPrefix(prefix: string): void {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new RangeError("Id prefix must be lowercase letters, digits or '_' and start with a letter");
  }
}

/** Deterministic ids for tests: `task_1`, `task_2`, `booking_1`, ... (counter per prefix). */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix) {
      assertPrefix(prefix);
      const value = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, value);
      return `${prefix}_${value}`;
    },
  };
}

/** Production ids: `<prefix>_<random UUID v4>`. */
export function createUuidIdGenerator(): IdGenerator {
  return {
    next(prefix) {
      assertPrefix(prefix);
      return `${prefix}_${crypto.randomUUID()}`;
    },
  };
}
