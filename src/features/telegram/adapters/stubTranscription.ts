import { TranscriptionUnavailableError } from "../domain";
import type { TranscriptionPort } from "../domain";

export type StubTranscriptionResponse =
  | { readonly text: string }
  | { readonly unavailable: string };

export type StubTranscriptionCall = {
  readonly mimeType: string;
  readonly languageHint?: string;
  readonly byteLength: number;
};

export type StubTranscription = TranscriptionPort & {
  /** Metadata of every call so far (a copy; audio bytes are not kept). */
  readonly calls: readonly StubTranscriptionCall[];
};

/**
 * Scripted speech-to-text for tests and offline demos. Each call consumes the
 * next scripted response; when the script is exhausted (or empty) the call
 * fails with `TranscriptionUnavailableError` instead of inventing a transcript.
 */
export function createStubTranscription(
  responses: readonly StubTranscriptionResponse[],
): StubTranscription {
  const queue = [...responses];
  const calls: StubTranscriptionCall[] = [];
  return {
    get calls() {
      return calls.map((call) => ({ ...call }));
    },
    async transcribe(input) {
      calls.push({
        mimeType: input.mimeType,
        ...(input.languageHint === undefined ? {} : { languageHint: input.languageHint }),
        byteLength: input.audio.byteLength,
      });
      const response = queue.shift();
      if (response === undefined) {
        throw new TranscriptionUnavailableError("Stub transcription has no scripted response left");
      }
      if ("unavailable" in response) {
        throw new TranscriptionUnavailableError(response.unavailable);
      }
      return { text: response.text };
    },
  };
}
