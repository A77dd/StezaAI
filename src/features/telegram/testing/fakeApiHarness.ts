import { Api } from "grammy";
import { createFakeBotApi } from "./fakeBotApi";
import type { FakeBotApiOptions } from "./fakeBotApi";
import { createMessageIdAllocator } from "./messageIds";
import { createTestClock } from "./testClock";

/**
 * A fake Bot API wired into a plain grammY `Api` with a test clock: the
 * smallest setup to call Bot API methods and look at what the fake did. The
 * test kit builds on it.
 */
export function createFakeApiHarness(options: FakeBotApiOptions = {}) {
  const clock = createTestClock();
  const messageIds = options.messageIds ?? createMessageIdAllocator();
  const fake = createFakeBotApi({ clock, messageIds, ...options });
  const api = new Api("123456:fake-token");
  api.config.use(fake.transformer);
  return { fake, api, clock, messageIds };
}

export type FakeApiHarness = ReturnType<typeof createFakeApiHarness>;
