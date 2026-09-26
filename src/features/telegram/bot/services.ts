import type { CallbackStore } from "../callbacks";
import type { TelegramConfig } from "../config";
import type {
  CalendarPort,
  Clock,
  IdGenerator,
  IntentParser,
  MemoryRepository,
  ReminderQueue,
  SettingsRepository,
  SlotScheduler,
  TaskRepository,
  TranscriptionPort,
} from "../domain";
import type { Logger } from "./logger";
import type { UpdateDeduper } from "./ports";

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
  readonly callbacks: CallbackStore;
  readonly logger: Logger;
  readonly deduper: UpdateDeduper;
};
