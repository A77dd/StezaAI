import { describe, expect, it } from "vitest";
import { createFixedClock } from "../adapters/fixedClock";
import { createSequentialIdGenerator } from "../adapters/idGenerator";
import { createInMemoryCallbackStore, createSequentialTokenGenerator, CallbackExpiredError } from "../callbacks";
import { TranscriptionUnavailableError } from "../domain";
import { createTestConfig } from "../testing/pipelineHarness";
import { createInMemoryServices } from "./inMemoryServices";
import { createMemoryLogger } from "./logger";

const START = "2026-09-23T09:00:00.000Z";

describe("createInMemoryServices", () => {
  it("wires every port", () => {
    const services = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() });

    expect(Object.keys(services).sort()).toEqual(
      [
        "calendar",
        "callbacks",
        "clock",
        "config",
        "deduper",
        "ids",
        "intentParser",
        "logger",
        "memory",
        "reminders",
        "scheduler",
        "settings",
        "tasks",
        "transcription",
      ].sort(),
    );
  });

  it("uses the given clock for the ports that depend on it", async () => {
    const clock = createFixedClock(START);
    const services = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger(), clock });
    const owner = { userId: "1", chatId: 1 };

    const data = await services.callbacks.issue({ action: "noop", ...owner, payload: {} });
    expect(await services.deduper.claim(1)).toBe("claimed");
    clock.advance(60 * 24 * 365);

    await expect(services.callbacks.resolve(data, owner)).rejects.toBeInstanceOf(CallbackExpiredError);
    expect(await services.deduper.claim(1)).toBe("claimed");
  });

  it("uses the given ids for the calendar's booking ids", async () => {
    const services = createInMemoryServices({
      config: createTestConfig(),
      logger: createMemoryLogger(),
      ids: createSequentialIdGenerator(),
    });

    const booking = await services.calendar.createBlock({
      userId: "1",
      taskId: "task_1",
      title: "Работа",
      slot: { start: "2026-09-24T07:00:00.000Z", end: "2026-09-24T08:00:00.000Z" },
    });

    expect(booking.id).toBe("booking_1");
  });

  it("lets a caller replace any port", async () => {
    const callbacks = createInMemoryCallbackStore({ clock: createFixedClock(START), tokens: createSequentialTokenGenerator() });
    const services = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger(), callbacks });

    expect(services.callbacks).toBe(callbacks);
  });

  it("has no speech-to-text until one is configured, and says so instead of inventing a transcript", async () => {
    const services = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() });

    await expect(
      services.transcription.transcribe({ audio: new Uint8Array(1), mimeType: "audio/ogg" }),
    ).rejects.toBeInstanceOf(TranscriptionUnavailableError);
  });

  it("gives every set its own state", async () => {
    const a = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() });
    const b = createInMemoryServices({ config: createTestConfig(), logger: createMemoryLogger() });

    expect(await a.deduper.claim(1)).toBe("claimed");
    expect(await b.deduper.claim(1)).toBe("claimed");
  });
});
