import { describe, expect, it } from "vitest";
import type { Api } from "grammy";
import type { BotContext } from "../../bot";
import { createMemoryLogger } from "../../bot";
import { createDraftStreamRegistry } from "../../bot";
import { ALEX } from "../../testing/participants";
import { makeViewContext } from "../../testing/viewFixtures";
import { runDemoStream } from "./commands";

type Draft = { text: string; canStop: boolean };

function fakeStreamingCtx(chatId: number) {
  const registry = createDraftStreamRegistry();
  const drafts: Draft[] = [];
  const finalMessages: unknown[] = [];
  const logger = createMemoryLogger();
  const api = {
    sendMessageDraft: async (_chatId: number, _draftId: number, text: string, other: { can_stop?: boolean }) => {
      drafts.push({ text, canStop: other.can_stop === true });
    },
    sendMessage: async () => {
      finalMessages.push({});
      return { message_id: 1, date: 0, chat: { id: chatId, type: "private", first_name: "Alex" } };
    },
  } as unknown as Api;
  const ctx = {
    from: ALEX,
    chat: { id: chatId, type: "private", first_name: "Alex" },
    services: { draftStreams: registry, logger },
    api,
    log: logger.child({ updateId: 1 }),
  } as unknown as BotContext;
  return { ctx, drafts, finalMessages };
}

describe("/demo: the streaming simulation", () => {
  it("streams the Thinking draft, paced paragraphs, and the final card", async () => {
    const { ctx, drafts, finalMessages } = fakeStreamingCtx(ALEX.id);
    const viewCtx = makeViewContext();

    await runDemoStream(ctx, viewCtx, { throttleMs: 1, pacingMs: 1 });

    expect(drafts.length).toBeGreaterThanOrEqual(viewCtx.catalog.demo.paragraphs.length + 1);
    expect(drafts[0]).toMatchObject({ text: "", canStop: true });
    const joined = drafts.map((d) => d.text).join("");
    for (const paragraph of viewCtx.catalog.demo.paragraphs) {
      expect(joined).toContain(paragraph);
    }
    expect(finalMessages).toHaveLength(1);
  });

  it("gives up without a final card when the user pressed Stop mid-generation", async () => {
    const { ctx, drafts, finalMessages } = fakeStreamingCtx(ALEX.id);
    const viewCtx = makeViewContext();

    const running = runDemoStream(ctx, viewCtx, { throttleMs: 1, pacingMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 30)); // one or two paragraphs in
    // The stream registered itself with the fresh registry, so it owns id 1.
    expect(ctx.services.draftStreams.stop(1)).toBe(true);
    await expect(running).resolves.toBeUndefined();

    expect(finalMessages).toHaveLength(0);
    expect(drafts.length).toBeLessThan(viewCtx.catalog.demo.paragraphs.length + 1);
  });

  it("refuses to stream outside a private chat", async () => {
    const { ctx, drafts } = fakeStreamingCtx(-1001234567890);
    (ctx as { chat: { type: string } }).chat.type = "supergroup";

    await expect(runDemoStream(ctx, makeViewContext(), { throttleMs: 1, pacingMs: 1 })).rejects.toThrow(
      /private chats/,
    );
    expect(drafts).toHaveLength(0);
  });
});
