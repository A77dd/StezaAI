import { describe, expect, it } from "vitest";
import { createInMemoryServices, createMemoryLogger } from "./bot";
import { createTelegramBot } from "./createTelegramBot";
import { createTelegramTestKit } from "./testing/testKit";
import { createTestConfig } from "./testing/pipelineHarness";

describe("createTelegramBot", () => {
  it("runs an update through the pipeline and the handlers without failing", async () => {
    const kit = createTelegramTestKit();
    const logger = createMemoryLogger();
    const bot = createTelegramBot({
      services: createInMemoryServices({ config: createTestConfig(), logger, clock: kit.clock }),
      botInfo: kit.botInfo,
      api: { transformers: [kit.fake.transformer], throttle: false },
    });

    await kit.deliver(bot, kit.updates.privateText("hello"));

    expect(logger.records.map((record) => record.event)).toEqual(["update.processed"]);
  });
});
