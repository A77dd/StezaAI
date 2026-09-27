import { describe, expect, it } from "vitest";
import { createStubTranscription } from "../../adapters/stubTranscription";
import { createPipelineHarness } from "../../testing/pipelineHarness";
import { ALEX } from "../../testing/participants";
import { registerPersonalFlow } from "./index";

describe("private voice", () => {
  it("reports unavailable immediately in the default composition", async () => {
    const h = createPipelineHarness({ composers: [registerPersonalFlow()], failRichMessages: true });
    await h.deliver(h.kit.updates.voice("voice-1", 4));
    expect(h.kit.fake.callsTo("getFile")).toHaveLength(0);
    expect(h.kit.fake.callsTo("sendMessage")[0]?.payload.text).toContain("голос");
  });

  it("downloads, transcribes, then submits the transcript with voice provenance", async () => {
    const paths: string[] = [];
    const transcription = createStubTranscription([{ text: "Посмотри договор до завтра" }]);
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      services: {
        transcription,
        voiceFileDownload: { async download(path: string) { paths.push(path); return new Uint8Array([1, 2, 3]); } },
      },
      failRichMessages: true,
    });
    await h.services.personalFlow.startUser({ userId: String(ALEX.id), locale: "ru" });
    await h.services.personalFlow.setTimezone({ userId: String(ALEX.id), tz: "Europe/Moscow" });
    const update = h.kit.updates.voice("voice-2", 4, { fileSize: 3 });
    await h.deliver(update);
    expect(h.kit.fake.callsTo("getFile")).toHaveLength(1);
    expect(paths).toEqual(["voice/voice-2"]);
    expect(transcription.calls).toMatchObject([{ mimeType: "audio/ogg", byteLength: 3 }]);
    const task = (await h.services.tasks.listByUser(String(ALEX.id)))[0];
    expect(task?.source).toMatchObject({ sourceType: "direct_message", sourceMessageId: update.message.message_id, sourceText: "Посмотри договор до завтра" });
  });

  it("rejects oversized and unsupported voice with localized notices before getFile", async () => {
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      services: { voiceFileDownload: { async download() { throw new Error("must not download"); } } },
      failRichMessages: true,
    });
    await h.deliver(h.kit.updates.voice("huge", 1, { fileSize: 21 * 1024 * 1024 }));
    await h.deliver(h.kit.updates.voice("unsupported", 1, { mimeType: "audio/wav" }));
    expect(h.kit.fake.callsTo("getFile")).toHaveLength(0);
    expect(h.kit.fake.callsTo("sendMessage")).toHaveLength(2);
  });

  it("surfaces transcription unavailability without logging transcript or file ids", async () => {
    const transcription = createStubTranscription([{ unavailable: "private provider detail" }]);
    const h = createPipelineHarness({
      composers: [registerPersonalFlow()],
      services: { transcription, voiceFileDownload: { async download() { return new Uint8Array([1]); } } },
      failRichMessages: true,
    });
    await h.deliver(h.kit.updates.voice("secret-file-id", 1, { fileSize: 1 }));
    expect(h.kit.fake.callsTo("sendMessage")[0]?.payload.text).toContain("голос");
    expect(h.logger.serialized()).not.toContain("secret-file-id");
    expect(h.logger.serialized()).not.toContain("private provider detail");
  });
});
