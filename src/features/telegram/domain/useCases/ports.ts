import type {
  CalendarPort,
  Clock,
  DraftRepository,
  IdGenerator,
  IntentParser,
  MemoryRepository,
  PendingInputRepository,
  ProposalRepository,
  ReminderQueue,
  SettingsRepository,
  SlotScheduler,
  TaskRepository,
  UserId,
} from "../index";

/**
 * A store of revocable, per-user tokens. `CallbackStore` (`../../callbacks`)
 * satisfies this shape, but the use-cases depend only on this minimal port so
 * `domain/` never imports the callback layer (ADR 0002 keeps `domain/`
 * self-contained; the callback layer already depends on `domain/` for its own
 * types, so the reverse import would be circular).
 */
export interface RevocableTokenStore {
  /** Deletes every token of the user; returns how many. */
  revokeForUser(userId: UserId): Promise<number>;
}

/**
 * Everything the personal-flow use-cases need from the outside world. A
 * composition root builds one of these from real or in-memory adapters and
 * passes it to `createPersonalFlow`; individual use-case factories accept a
 * `Pick` of only the ports they use.
 */
export type PersonalFlowPorts = {
  readonly tasks: TaskRepository;
  readonly settings: SettingsRepository;
  readonly drafts: DraftRepository;
  readonly proposals: ProposalRepository;
  readonly pendingInputs: PendingInputRepository;
  readonly intentParser: IntentParser;
  readonly scheduler: SlotScheduler;
  readonly calendar: CalendarPort;
  readonly reminders: ReminderQueue;
  readonly memory: MemoryRepository;
  readonly callbackTokens: RevocableTokenStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};
