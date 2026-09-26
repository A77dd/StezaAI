import { describe, expect, it } from "vitest";
import { ALLOWED_UPDATES } from "./allowedUpdates";

describe("ALLOWED_UPDATES", () => {
  it("lists the kinds the bot has handlers for", () => {
    expect([...ALLOWED_UPDATES].sort()).toEqual(
      [
        "callback_query",
        "chosen_inline_result",
        "edited_message",
        "guest_message",
        "inline_query",
        "message",
        "my_chat_member",
        "stopped_message_generation",
      ].sort(),
    );
  });

  it("has no duplicates", () => {
    expect(new Set(ALLOWED_UPDATES).size).toBe(ALLOWED_UPDATES.length);
  });

  it("leaves out kinds the bot does not handle (they would be received and ignored)", () => {
    for (const kind of ["channel_post", "message_reaction", "chat_member", "poll", "pre_checkout_query"]) {
      expect(ALLOWED_UPDATES).not.toContain(kind);
    }
  });
});
