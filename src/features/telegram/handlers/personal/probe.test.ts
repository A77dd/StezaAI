import { describe, expect, it } from "vitest";
import { ALEX } from "../../testing/participants";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { registerPersonalFlow } from "./index";

describe("probe", () => {
  it("shows the meeting demo failure", async () => {
    const h = createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
    try {
      await h.deliver(h.kit.updates.command("demo_meeting", undefined, { from: ALEX }));
      console.log("OK");
    } catch {
      console.log("FAILED RECORD:", JSON.stringify(h.logger.records.find((r) => r.event === "update.failed")));
      console.log("CALLS:", h.kit.fake.calls.map((c) => `${c.method}:${c.outcome.kind}`).join(" | "));
    }
    expect(true).toBe(true);
  });
});
