import { describe, expect, it } from "vitest";
import { createPromptTracker } from "./promptTracker";

describe("PromptTracker", () => {
  it("peeks without clearing, then consumes the prompt", () => {
    const tracker = createPromptTracker();
    const prompt = { promptMessageId: 42, purpose: "timezone" as const };
    tracker.remember("user_1", 1001, prompt);

    expect(tracker.peek("user_1", 1001)).toEqual(prompt);
    expect(tracker.peek("user_1", 1001)).toEqual(prompt);

    tracker.consume("user_1", 1001);

    expect(tracker.peek("user_1", 1001)).toBeUndefined();
  });

  it("keeps prompts isolated by user and chat", () => {
    const tracker = createPromptTracker();
    tracker.remember("user_1", 1001, { promptMessageId: 42, purpose: "timezone" });

    expect(tracker.peek("user_1", 2002)).toBeUndefined();
    expect(tracker.peek("user_2", 1001)).toBeUndefined();
  });
});
