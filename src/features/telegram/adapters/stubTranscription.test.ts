import { describe, expect, it } from "vitest";
import { TranscriptionUnavailableError } from "../domain/errors";
import { createStubTranscription } from "./stubTranscription";

const audio = new Uint8Array([1, 2, 3]);

describe("createStubTranscription", () => {
  it("returns canned transcripts in order, one per call", async () => {
    const stub = createStubTranscription([{ text: "первый" }, { text: "второй" }]);
    await expect(stub.transcribe({ audio, mimeType: "audio/ogg" })).resolves.toEqual({ text: "первый" });
    await expect(stub.transcribe({ audio, mimeType: "audio/ogg" })).resolves.toEqual({ text: "второй" });
  });

  it("throws TranscriptionUnavailableError for an unavailable response", async () => {
    const stub = createStubTranscription([{ unavailable: "service down" }]);
    await expect(stub.transcribe({ audio, mimeType: "audio/ogg" })).rejects.toThrow(
      TranscriptionUnavailableError,
    );
  });

  it("fails explicitly when the script is exhausted", async () => {
    const stub = createStubTranscription([{ text: "один" }]);
    await stub.transcribe({ audio, mimeType: "audio/ogg" });
    await expect(stub.transcribe({ audio, mimeType: "audio/ogg" })).rejects.toThrow(
      TranscriptionUnavailableError,
    );
  });

  it("with no script every call is unavailable", async () => {
    const stub = createStubTranscription([]);
    await expect(stub.transcribe({ audio, mimeType: "audio/ogg" })).rejects.toThrow(
      TranscriptionUnavailableError,
    );
  });

  it("records call metadata without keeping the audio bytes", async () => {
    const stub = createStubTranscription([{ text: "ок" }]);
    await stub.transcribe({ audio, mimeType: "audio/ogg", languageHint: "ru" });
    expect(stub.calls).toEqual([{ mimeType: "audio/ogg", languageHint: "ru", byteLength: 3 }]);
  });

  it("does not leak its internal call log", async () => {
    const stub = createStubTranscription([{ text: "ок" }]);
    await stub.transcribe({ audio, mimeType: "audio/ogg" });
    (stub.calls as unknown as unknown[]).length = 0;
    expect(stub.calls).toHaveLength(1);
  });
});
