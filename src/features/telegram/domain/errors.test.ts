import { describe, expect, it } from "vitest";
import {
  AlreadyExistsError,
  IntentParserUnavailableError,
  InvalidArgumentError,
  InvalidIntentError,
  InvalidSettingsError,
  InvalidTimeError,
  InvalidTimezoneError,
  MemoryNotConfirmedError,
  NotFoundError,
  ReminderStateError,
  SlotConflictError,
  TelegramLayerError,
  TranscriptionUnavailableError,
} from "./errors";

const cases = [
  [new SlotConflictError("m"), "slot_conflict"],
  [new NotFoundError("m"), "not_found"],
  [new AlreadyExistsError("m"), "already_exists"],
  [new TranscriptionUnavailableError("m"), "transcription_unavailable"],
  [new InvalidTimezoneError("m"), "invalid_timezone"],
  [new InvalidIntentError("m"), "invalid_intent"],
  [new InvalidTimeError("m"), "invalid_time"],
  [new InvalidSettingsError("m"), "invalid_settings"],
  [new ReminderStateError("m"), "reminder_state"],
  [new MemoryNotConfirmedError("m"), "memory_not_confirmed"],
  [new InvalidArgumentError("m"), "invalid_argument"],
  [new IntentParserUnavailableError("m"), "intent_parser_unavailable"],
] as const;

describe("telegram layer errors", () => {
  it.each(cases)("%s carries a stable code", (error, code) => {
    expect(error).toBeInstanceOf(TelegramLayerError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.message).toBe("m");
    expect(error.name).toBe(error.constructor.name);
  });

  it("uses distinct codes", () => {
    const codes = cases.map(([, code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("preserves the cause", () => {
    const cause = new RangeError("boom");
    const error = new InvalidTimezoneError("bad", { cause });
    expect(error.cause).toBe(cause);
  });
});
