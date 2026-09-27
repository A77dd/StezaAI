import { describe, expect, it, vi } from "vitest";
import type { Api } from "grammy";
import { createDraftStream, createDraftStreamRegistry } from "./draftStreams";
import { createMemoryLogger } from "./logger";

function makeDeps(overrides: Partial<Parameters<typeof createDraftStream>[0]> = {}) {
  const registry = createDraftStreamRegistry();
  const drafts: Array<{ text: string; draftId: number; canStop: boolean }> = [];
  const api = {
    sendMessageDraft: async (chatId: number, draftId: number, text: string, other: { can_stop?: boolean }) => {
      drafts.push({ text, draftId, canStop: other.can_stop === true });
    },
  } as unknown as Api;
  const logger = createMemoryLogger();
  const stream = createDraftStream({
    api,
    registry,
    logger,
    chatId: 1001,
    throttleMs: overrides.throttleMs ?? 5,
    pacingMs: overrides.pacingMs ?? 2,
    ...overrides,
  });
  return { registry, drafts, api, logger, stream };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

describe("createDraftStream", () => {
  it("begins with an empty Thinking draft that carries the stop button", async () => {
    const { stream, drafts } = makeDeps();
    await stream.begin();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ text: "", canStop: true });
    expect(stream.draftId).toBeGreaterThan(0);
  });

  it("coalesces bursts of chunks into one draft per throttle window", async () => {
    const { stream, drafts } = makeDeps({ throttleMs: 10 });
    await stream.begin();
    stream.push("abc");
    stream.push("def");
    stream.push("ghi");
    expect(drafts).toHaveLength(1); // nothing flushed before the window ends
    await settle();
    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.text).toBe("abcdefghi");
  });

  it("stops flushing and releases the id when the user presses Stop", async () => {
    const { stream, drafts, registry } = makeDeps();
    await stream.begin();
    stream.push("partial");
    expect(registry.stop(stream.draftId)).toBe(true);
    expect(stream.stopped).toBe(true);
    await settle();
    expect(drafts).toHaveLength(1); // the pending chunk was never flushed
  });

  it("pushPaced pauses so a producer can honor Stop between chunks", async () => {
    const { stream, registry, drafts } = makeDeps({ pacingMs: 30 });
    await stream.begin();
    const generating = (async () => {
      for (const chunk of ["one", "two", "three"]) {
        if (stream.stopped) return "stopped";
        await stream.pushPaced(chunk);
      }
      return "done";
    })();
    await new Promise((resolve) => setTimeout(resolve, 15)); // inside the first paced chunk
    registry.stop(stream.draftId);
    await expect(generating).resolves.toBe("stopped");
    expect(drafts.length).toBeLessThan(4);
  });

  it("finish flushes unseen text and then sends the final card", async () => {
    const { stream, drafts } = makeDeps({ throttleMs: 10_000 });
    await stream.begin();
    stream.push("unseen text");
    let finalSent = 0;
    await stream.finish(async () => {
      finalSent += 1;
    });
    expect(finalSent).toBe(1);
    expect(drafts.map((d) => d.text)).toContain("unseen text");
  });

  it("logs a rejected draft instead of failing the generation", async () => {
    const { api, stream, logger } = makeDeps();
    vi.spyOn(api, "sendMessageDraft").mockRejectedValueOnce(new Error("429"));
    await stream.begin();
    expect(logger.records.some((r) => r.event === "stream.draft_rejected")).toBe(true);
  });
});
