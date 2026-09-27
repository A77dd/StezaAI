import {
  createFixedClock,
  createInMemoryCalendar,
  createInMemoryDraftRepository,
  createInMemoryMemoryRepository,
  createInMemoryPendingInputRepository,
  createInMemoryProposalRepository,
  createInMemoryReminderQueue,
  createInMemorySettingsRepository,
  createInMemoryTaskRepository,
  createRuleBasedIntentParser,
  createSequentialIdGenerator,
  createSlotScheduler,
} from "../adapters";
import type { FixedClock } from "../adapters";
import { createInMemoryCallbackStore, createSequentialTokenGenerator } from "../callbacks";
import type { PersonalFlowPorts } from "../domain/useCases";

/**
 * Fake data only: a fully wired `PersonalFlowPorts` from the deterministic
 * in-memory adapters, sharing one `FixedClock` and one sequential
 * `IdGenerator` so use-case tests are deterministic end to end. Every field
 * can be overridden to inject a specific fake for one test.
 */
export type TestPersonalFlowPorts = PersonalFlowPorts & { readonly clock: FixedClock };

const DEFAULT_START = "2026-09-23T08:30:00.000Z";

export function createTestPersonalFlowPorts(
  overrides: Partial<PersonalFlowPorts> = {},
  start: string = DEFAULT_START,
): TestPersonalFlowPorts {
  const clock = (overrides.clock as FixedClock | undefined) ?? createFixedClock(start);
  const ids = overrides.ids ?? createSequentialIdGenerator();
  return {
    clock,
    ids,
    tasks: overrides.tasks ?? createInMemoryTaskRepository(),
    settings: overrides.settings ?? createInMemorySettingsRepository(),
    drafts: overrides.drafts ?? createInMemoryDraftRepository({ clock }),
    proposals: overrides.proposals ?? createInMemoryProposalRepository({ clock }),
    pendingInputs: overrides.pendingInputs ?? createInMemoryPendingInputRepository({ clock }),
    intentParser: overrides.intentParser ?? createRuleBasedIntentParser(),
    scheduler: overrides.scheduler ?? createSlotScheduler(),
    calendar: overrides.calendar ?? createInMemoryCalendar({ ids }),
    reminders: overrides.reminders ?? createInMemoryReminderQueue(),
    memory: overrides.memory ?? createInMemoryMemoryRepository(),
    callbackTokens:
      overrides.callbackTokens ??
      createInMemoryCallbackStore({ clock, tokens: createSequentialTokenGenerator() }),
  };
}
