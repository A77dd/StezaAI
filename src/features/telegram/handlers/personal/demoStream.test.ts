import { describe, expect, it } from "vitest";
import type { Api } from "grammy";
import type { BotContext } from "../../bot";
import { createDraftStreamRegistry, createMemoryLogger } from "../../bot";
import { ALEX } from "../../testing/participants";
import { makeViewContext } from "../../testing/viewFixtures";
import { runDemoStream } from "./commands";

const GROUP_ID = -1001234567890;

type Draft = { text: string; canStop: boolean };

function fakeStreamingCtx(chatId: number, chatType: "private" | "supergroup" = "private") {
  const registry = createDraftStreamRegistry();
  const drafts: Draft[] = [];
  const edits: Array<{ text: string; parseMode?: string }> = [];
  const sentMessages: Array<{ text: string }> = [];
  const logger = createMemoryLogger();
  const api = {
    sendMessageDraft: async (_chatId: number, _draftId: number, text: string, other: { can_stop?: boolean }) => {
      drafts.push({ text, canStop: other.can_stop === true });
    },
    sendMessage: async (_chatId: number, text: string) => {
      sentMessages.push({ text });
      return { message_id: 555, date: 0, chat: { id: chatId, type: chatType, first_name: "Alex" } };
    },
    editMessageText: async (_chatId: number, _messageId: number, text: string, other?: { parse_mode?: string }) => {
      edits.push({ text, parseMode: other?.parse_mode });
      return true;
    },
  } as unknown as Api;
  const ctx = {
    from: ALEX,
    chat: { id: chatId, type: chatType, first_name: "Alex", title: "Group" },
    msg: { is_topic_message: false, message_thread_id: 42 },
    services: { draftStreams: registry, logger },
    api,
    log: logger.child({ updateId: 1 }),
  } as unknown as BotContext;
  return { ctx, drafts, edits, sentMessages };
}

describe("/demo: the streaming simulation", () => {
  it("streams the Thinking draft, paced paragraphs, and the final card in a private chat", async () => {
    const { ctx, drafts, sentMessages } = fakeStreamingCtx(ALEX.id);
    const viewCtx = makeViewContext();

    await runDemoStream(ctx, viewCtx, { throttleMs: 1, pacingMs: 1 });

    expect(drafts.length).toBeGreaterThanOrEqual(viewCtx.catalog.demo.paragraphs.length + 1);
    expect(drafts[0]).toMatchObject({ text: "", canStop: true });
    const joined = drafts.map((d) => d.text).join("");
    for (const paragraph of viewCtx.catalog.demo.paragraphs) {
      expect(joined).toContain(paragraph);
    }
    // The final card lands as a fresh sendMessage (it replaces the draft).
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.text).toContain(viewCtx.catalog.demo.doneTitle);
  });

  it("gives up without a final card when the user pressed Stop mid-generation", async () => {
    const { ctx, drafts, sentMessages } = fakeStreamingCtx(ALEX.id);
    const viewCtx = makeViewContext();

    const running = runDemoStream(ctx, viewCtx, { throttleMs: 1, pacingMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 30)); // one or two paragraphs in
    // The stream registered itself with the fresh registry, so it owns id 1.
    expect(ctx.services.draftStreams.stop(1)).toBe(true);
    await expect(running).resolves.toBeUndefined();

    expect(sentMessages).toHaveLength(0);
    expect(drafts.length).toBeLessThan(viewCtx.catalog.demo.paragraphs.length + 1);
  });

  it("falls back to message edits in a group: thinking placeholder, paced edits, final edit", async () => {
    const { ctx, drafts, edits, sentMessages } = fakeStreamingCtx(GROUP_ID, "supergroup");
    const viewCtx = makeViewContext();

    await runDemoStream(ctx, viewCtx, { throttleMs: 1, pacingMs: 1 });

    expect(drafts).toHaveLength(0); // drafts do not exist in groups
    // The placeholder was sent first, then the text grew through edits.
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.text).toBe(viewCtx.catalog.stream.thinking);
    const edited = edits.map((e) => e.text).join("");
    for (const paragraph of viewCtx.catalog.demo.paragraphs) {
      expect(edited).toContain(paragraph);
    }
    // The last edit swaps in the final card (Telegram HTML).
    const last = edits[edits.length - 1];
    expect(last?.parseMode).toBe("HTML");
    expect(last?.text).toContain(viewCtx.catalog.demo.doneTitle);
  });
});
