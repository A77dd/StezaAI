import {
  createCryptoTokenGenerator,
  createInMemoryCallbackStore,
} from "../callbacks";
import {
  createInMemoryCalendar,
  createInMemoryMemoryRepository,
  createInMemoryReminderQueue,
  createInMemorySettingsRepository,
  createInMemoryTaskRepository,
  createRuleBasedIntentParser,
  createSlotScheduler,
  createStubTranscription,
  createSystemClock,
  createUuidIdGenerator,
} from "../adapters";
import type { TelegramConfig } from "../config";
import { createInMemoryUpdateDeduper } from "./inMemoryUpdateDeduper";
import type { Logger } from "./logger";
import type { BotServices } from "./services";

export type InMemoryServicesInput = {
  readonly config: TelegramConfig;
  /**
   * Required: where logs go is a deliberate choice (a JSON logger with a
   * stdout sink, or a memory logger in tests), never a silent default.
   */
  readonly logger: Logger;
} & Partial<Omit<BotServices, "config" | "logger">>;

/**
 * Wires the deterministic in-memory adapters into `BotServices`. Anything in
 * `input` replaces the default, and ports that depend on the clock or the id
 * generator (calendar, callback store, deduper) are built from the ones given,
 * so passing a fixed clock makes the whole set deterministic.
 *
 * Defaults: the system clock and UUID ids (real time, real ids); a stub
 * transcription that answers `TranscriptionUnavailableError` (no speech-to-text
 * is configured until a provider exists); the rule-based intent parser.
 */
export function createInMemoryServices(input: InMemoryServicesInput): BotServices {
  const clock = input.clock ?? createSystemClock();
  const ids = input.ids ?? createUuidIdGenerator();
  return {
    config: input.config,
    logger: input.logger,
    clock,
    ids,
    intentParser: input.intentParser ?? createRuleBasedIntentParser(),
    scheduler: input.scheduler ?? createSlotScheduler(),
    calendar: input.calendar ?? createInMemoryCalendar({ ids }),
    tasks: input.tasks ?? createInMemoryTaskRepository(),
    settings: input.settings ?? createInMemorySettingsRepository(),
    memory: input.memory ?? createInMemoryMemoryRepository(),
    reminders: input.reminders ?? createInMemoryReminderQueue(),
    transcription: input.transcription ?? createStubTranscription([]),
    callbacks:
      input.callbacks ?? createInMemoryCallbackStore({ clock, tokens: createCryptoTokenGenerator() }),
    deduper: input.deduper ?? createInMemoryUpdateDeduper({ clock }),
  };
}
