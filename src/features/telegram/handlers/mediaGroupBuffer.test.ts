import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSource } from "../testing/domainFixtures";
import { createMediaGroupBuffer } from "./mediaGroupBuffer";

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  const flushed: Array<{ text: string; ids: readonly number[]; primary: number | null }> = [];
  const buffer = createMediaGroupBuffer({
    timers: { setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: (id) => clearTimeout(id) },
    onFlush: async (item) => { flushed.push({ text: item.text, ids: item.source.relatedMessageIds, primary: item.source.sourceMessageId }); },
    onError: (error) => { throw error; },
  });
  const add = (id: number, text: string, chatId = 1, mediaGroupId = "g") => buffer.add({
    chatId,
    mediaGroupId,
    message: { text, dateTimeHints: [], source: makeSource({ sourceType: "forwarded_message", sourceMessageId: id, sourceText: text }) },
  });
  return { buffer, flushed, add };
}

describe("media group buffer", () => {
  it("sorts out-of-order items and keeps primary and related ids", async () => {
    const { buffer, flushed, add } = setup();
    await add(9, "last");
    await add(3, "first");
    await add(5, "  ");
    await vi.advanceTimersByTimeAsync(1000);
    await buffer.drain();
    expect(flushed).toEqual([{ text: "first\nlast", primary: 3, ids: [5, 9] }]);
  });

  it("resets inactivity debounce", async () => {
    const { buffer, flushed, add } = setup();
    await add(1, "a");
    await vi.advanceTimersByTimeAsync(900);
    await add(2, "b");
    await vi.advanceTimersByTimeAsync(999);
    expect(flushed).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await buffer.drain();
    expect(flushed).toHaveLength(1);
  });

  it("flushes at ten items and clears timers", async () => {
    const { buffer, flushed, add } = setup();
    for (let id = 1; id <= 10; id += 1) await add(id, String(id));
    await buffer.drain();
    expect(flushed).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hard flushes after five seconds despite ongoing messages", async () => {
    const { buffer, flushed, add } = setup();
    await add(1, "a");
    for (let id = 2; id <= 6; id += 1) {
      await vi.advanceTimersByTimeAsync(900);
      await add(id, String(id));
    }
    await vi.advanceTimersByTimeAsync(500);
    await buffer.drain();
    expect(flushed).toHaveLength(1);
  });

  it("close drains pending groups and rejects new items", async () => {
    const { buffer, flushed, add } = setup();
    await add(1, "a");
    await buffer.close();
    expect(flushed).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(add(2, "b")).rejects.toThrow(/closed/);
  });
});
