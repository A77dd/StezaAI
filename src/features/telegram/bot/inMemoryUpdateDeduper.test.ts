import { describe, expect, it } from "vitest";
import { createFixedClock } from "../adapters/fixedClock";
import { DEFAULT_UPDATE_ID_TTL_MS, createInMemoryUpdateDeduper } from "./inMemoryUpdateDeduper";

const START = "2026-09-23T09:00:00.000Z";
const DAY_MINUTES = 24 * 60;

describe("createInMemoryUpdateDeduper", () => {
  it("claims a new update id once and reports later claims as duplicates", async () => {
    const deduper = createInMemoryUpdateDeduper({ clock: createFixedClock(START) });

    expect(await deduper.claim(100)).toBe("claimed");
    expect(await deduper.claim(100)).toBe("duplicate");
    expect(await deduper.claim(101)).toBe("claimed");
  });

  it("is a set, not a high-water mark: an older id after a newer one is still new", async () => {
    // Telegram may restart the sequence at a random value after a quiet week.
    const deduper = createInMemoryUpdateDeduper({ clock: createFixedClock(START) });

    expect(await deduper.claim(900_000)).toBe("claimed");
    expect(await deduper.claim(5)).toBe("claimed");
    expect(await deduper.claim(900_000)).toBe("duplicate");
  });

  it("lets a released id be claimed again (retry after a failed attempt)", async () => {
    const deduper = createInMemoryUpdateDeduper({ clock: createFixedClock(START) });
    await deduper.claim(100);

    await deduper.release(100);

    expect(await deduper.claim(100)).toBe("claimed");
  });

  it("releasing an id that was never claimed is not an error", async () => {
    const deduper = createInMemoryUpdateDeduper({ clock: createFixedClock(START) });

    await expect(deduper.release(1)).resolves.toBeUndefined();
  });

  it("forgets an id after the TTL (7 days by default)", async () => {
    const clock = createFixedClock(START);
    const deduper = createInMemoryUpdateDeduper({ clock });
    await deduper.claim(100);

    clock.advance(7 * DAY_MINUTES - 1);
    expect(await deduper.claim(100)).toBe("duplicate");

    clock.advance(2);
    expect(await deduper.claim(100)).toBe("claimed");
    expect(DEFAULT_UPDATE_ID_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("keeps at most maxEntries ids and drops the oldest first", async () => {
    const deduper = createInMemoryUpdateDeduper({ clock: createFixedClock(START), maxEntries: 3 });
    for (const id of [1, 2, 3, 4]) await deduper.claim(id);

    expect(await deduper.claim(4)).toBe("duplicate");
    expect(await deduper.claim(3)).toBe("duplicate");
    expect(await deduper.claim(1)).toBe("claimed");
  });

  it("does not let an expired entry occupy a slot", async () => {
    const clock = createFixedClock(START);
    const deduper = createInMemoryUpdateDeduper({ clock, maxEntries: 2, ttlMs: 60_000 });
    await deduper.claim(1);
    await deduper.claim(2);

    clock.advance(2);
    await deduper.claim(3);

    expect(await deduper.claim(2)).toBe("claimed");
  });

  it("rejects invalid limits", () => {
    const clock = createFixedClock(START);
    expect(() => createInMemoryUpdateDeduper({ clock, maxEntries: 0 })).toThrow(/maxEntries/);
    expect(() => createInMemoryUpdateDeduper({ clock, ttlMs: -1 })).toThrow(/ttlMs/);
  });
});
