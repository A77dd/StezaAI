import { describe, expect, it } from "vitest";
import { ALEX, createGroupChat } from "../testing/participants";
import { createUpdateBuilder } from "../testing/updates";
import { extractForwardedMessage } from "./forwardExtractor";

const updates = createUpdateBuilder({ botUsername: "steza_test_bot" });

describe("forward extraction", () => {
  it("preserves a visible user's identity and origin time", () => {
    const message = updates.forwardedText("Посмотри договор", { kind: "user", user: ALEX, date: 1_700_000_000 }).message;
    expect(extractForwardedMessage(message)?.source).toMatchObject({
      sourceType: "forwarded_message",
      sourceChatId: ALEX.id,
      sourceAuthor: ALEX.first_name,
      sourceTimestamp: new Date(1_700_000_000_000).toISOString(),
      hiddenOrigin: false,
      relatedMessageIds: [],
    });
  });

  it("keeps hidden origins private and retains chat names", () => {
    const hidden = updates.forwardedText("x", { kind: "hidden_user", name: "Private sender" }).message;
    const chat = createGroupChat();
    const fromChat = updates.forwardedText("x", { kind: "chat", chat }).message;
    expect(extractForwardedMessage(hidden)?.source).toMatchObject({ sourceChatId: ALEX.id, originChatId: null, sourceAuthor: "Private sender", hiddenOrigin: true });
    expect(extractForwardedMessage(fromChat)?.source).toMatchObject({ sourceChatId: ALEX.id, originChatId: chat.id, sourceAuthor: chat.title, hiddenOrigin: false });
  });

  it("preserves channel identity and extracts caption date_time entities", () => {
    const channel = { id: -1005001, type: "channel" as const, title: "Project news" };
    const message = updates.forwardedText("placeholder", { kind: "channel", chat: channel, messageId: 20 }).message;
    const withCaption = {
      ...message,
      text: undefined,
      entities: undefined,
      caption: "Встреча завтра",
      caption_entities: [{ type: "date_time" as const, offset: 0, length: 7, unix_time: 1_800_000_000, date_time_format: "d" as const }],
    };
    const extracted = extractForwardedMessage(withCaption);
    expect(extracted?.source).toMatchObject({ sourceChatId: ALEX.id, originChatId: channel.id, sourceAuthor: channel.title, hiddenOrigin: false });
    expect(extracted?.text).toBe("Встреча завтра");
    expect(extracted?.dateTimeHints).toEqual([new Date(1_800_000_000_000).toISOString()]);
  });

  it("extracts date_time entities in text order", () => {
    const message = updates.forwardedText("Посмотри договор до завтра", { kind: "user", user: ALEX }, {
      entities: [
        { type: "date_time", offset: 0, length: 8, unix_time: 1_800_000_000, date_time_format: "d" },
        { type: "date_time", offset: 9, length: 7, unix_time: 1_900_000_000, date_time_format: "d" },
      ],
    }).message;
    expect(extractForwardedMessage(message)?.dateTimeHints).toEqual([
      new Date(1_800_000_000_000).toISOString(),
      new Date(1_900_000_000_000).toISOString(),
    ]);
  });
});
