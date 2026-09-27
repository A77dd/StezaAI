import { describe, expect, it } from "vitest";
import { ALEX } from "../testing/participants";
import { createPipelineHarness } from "../testing/pipelineHarness";
import { registerStreaming } from "./streaming";

describe("stopped_message_generation (the draft Stop button)", () => {
  it("stops the live stream that matches the update's draft id", async () => {
    const h = createPipelineHarness({ composers: [registerStreaming()] });
    let stopped = false;
    h.services.draftStreams.register({ draftId: 7, onStopped: () => { stopped = true; } });

    await h.deliver(h.kit.updates.messageGenerationStopped({ draftId: 7, user: ALEX }));

    expect(stopped).toBe(true);
  });

  it("ignores an id that no longer matches a live stream", async () => {
    const h = createPipelineHarness({ composers: [registerStreaming()] });

    await expect(
      h.deliver(h.kit.updates.messageGenerationStopped({ draftId: 404, user: ALEX })),
    ).resolves.toBeUndefined();
  });
});
