import {
  createCryptoTokenGenerator,
  createInMemoryCallbackStore,
} from "../callbacks";
import {
  createInMemoryCalendar,
  createInMemoryDraftRepository,
  createInMemoryMemoryRepository,
  createInMemoryPendingInputRepository,
  createInMemoryProposalRepository,
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
import { createPersonalFlow } from "../domain/useCases";
import { createInMemoryUpdateDeduper } from "./inMemoryUpdateDeduper";
import type { Logger } from "./logger";
import { createPromptTracker } from "./promptTracker";
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
  const intentParser = input.intentParser ?? createRuleBasedIntentParser();
  const scheduler = input.scheduler ?? createSlotScheduler();
  const calendar = input.calendar ?? createInMemoryCalendar({ ids });
  const tasks = input.tasks ?? createInMemoryTaskRepository();
  const settings = input.settings ?? createInMemorySettingsRepository();
  const memory = input.memory ?? createInMemoryMemoryRepository();
  const reminders = input.reminders ?? createInMemoryReminderQueue();
  const callbacks =
    input.callbacks ?? createInMemoryCallbackStore({ clock, tokens: createCryptoTokenGenerator() });
  const drafts = input.drafts ?? createInMemoryDraftRepository({ clock });
  const proposals = input.proposals ?? createInMemoryProposalRepository({ clock });
  const pendingInputs = input.pendingInputs ?? createInMemoryPendingInputRepository({ clock });

  const personalFlow =
    input.personalFlow ??
    createPersonalFlow({
      tasks,
      settings,
      drafts,
      proposals,
      pendingInputs,
      intentParser,
      scheduler,
      calendar,
      reminders,
      memory,
      callbackTokens: callbacks,
      clock,
      ids,
    });

  return {
    config: input.config,
    logger: input.logger,
    clock,
    ids,
    intentParser,
    scheduler,
    calendar,
    tasks,
    settings,
    memory,
    reminders,
    transcription: input.transcription ?? createStubTranscription([]),
    callbacks,
    deduper: input.deduper ?? createInMemoryUpdateDeduper({ clock }),
    drafts,
    proposals,
    pendingInputs,
    promptTracker: input.promptTracker ?? createPromptTracker(),
    personalFlow,
  };
}
