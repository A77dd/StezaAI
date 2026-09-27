import type { CallbackStore } from "../callbacks";
import type { TelegramConfig } from "../config";
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
  TranscriptionPort,
} from "../domain";
import type { PersonalFlow } from "../domain/useCases";
import type { Logger } from "./logger";
import type { TelegramFileDownloadPort, UpdateDeduper } from "./ports";
import type { PromptTracker } from "./promptTracker";

/**
 * Everything the bot needs from the outside world, as ports. Handlers reach
 * it through `ctx.services` and nothing else: no module-level singletons, so
 * a test (or a second bot) simply builds another set. The composition root
 * decides which adapters back the ports; `createInMemoryServices` is the
 * deterministic set used by tests, the local polling demo and, until real
 * providers exist, the runtime.
 */
export type BotServices = {
  readonly config: TelegramConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly intentParser: IntentParser;
  readonly scheduler: SlotScheduler;
  readonly calendar: CalendarPort;
  readonly tasks: TaskRepository;
  readonly settings: SettingsRepository;
  readonly memory: MemoryRepository;
  readonly reminders: ReminderQueue;
  readonly transcription: TranscriptionPort;
  /** Null until a host explicitly provides secure Telegram file retrieval. */
  readonly voiceFileDownload: TelegramFileDownloadPort | null;
  readonly callbacks: CallbackStore;
  readonly logger: Logger;
  readonly deduper: UpdateDeduper;
  /** Short-lived drafts awaiting a timezone, a low-confidence classification, or a kind choice (ADR 0002 Task 7). */
  readonly drafts: DraftRepository;
  /** The slot proposal currently offered for a task. */
  readonly proposals: ProposalRepository;
  /** A free-text answer the bot expects after prompting (task edit, working hours, timezone). */
  readonly pendingInputs: PendingInputRepository;
  /** Which prompt message a chat is waiting on a plain-text reply for; see `./promptTracker`. */
  readonly promptTracker: PromptTracker;
  /** The personal-flow use-cases (Task 7a), wired to this same set of ports. */
  readonly personalFlow: PersonalFlow;
};
