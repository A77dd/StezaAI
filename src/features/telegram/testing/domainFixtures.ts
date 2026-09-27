import { createDefaultSettings } from "../domain";
import type {
  Draft,
  MemoryRecord,
  PendingInput,
  Reminder,
  SourceRef,
  StoredSlotProposal,
  Task,
  UserSettings,
} from "../domain";

// Fake data only: builders for domain values used across telegram tests.

export function makeSource(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    sourceType: "direct_message",
    sourceChatId: 1001,
    sourceMessageId: 1,
    sourceText: "Нужно подготовить презентацию",
    sourceAuthor: null,
    sourceTimestamp: null,
    hiddenOrigin: false,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    userId: "user_1",
    title: "Подготовить презентацию",
    kind: "task",
    deadline: null,
    durationMinutes: 60,
    priority: "normal",
    source: makeSource(),
    status: "inbox",
    createdAt: "2026-09-23T08:30:00.000Z",
    bookingId: null,
    ...overrides,
  };
}

/** Moscow, Mon-Fri 09:00-18:00, unless overridden. */
export function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    ...createDefaultSettings("user_1", "ru"),
    timezone: "Europe/Moscow",
    ...overrides,
  };
}

export function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "reminder_1",
    userId: "user_1",
    chatId: 1001,
    taskId: "task_1",
    kind: "block_start",
    dueAt: "2026-09-24T07:00:00.000Z",
    status: "pending",
    attempts: 0,
    lastError: null,
    leasedUntil: null,
    nextAttemptAt: null,
    ...overrides,
  };
}

export type ActualDurationRecord = Extract<MemoryRecord, { kind: "actual_duration" }>;
export type RescheduleCountRecord = Extract<MemoryRecord, { kind: "reschedule_count" }>;

export function makeActualDurationRecord(
  overrides: Partial<ActualDurationRecord> = {},
): ActualDurationRecord {
  return {
    id: "memory_1",
    recordedAt: "2026-09-24T10:00:00.000Z",
    confirmedByUser: true,
    kind: "actual_duration",
    taskId: "task_1",
    minutes: 45,
    ...overrides,
  };
}

export function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft_1",
    userId: "user_1",
    chatId: 1001,
    intent: null,
    source: makeSource(),
    createdAt: "2026-09-23T08:30:00.000Z",
    expiresAt: "2026-09-24T08:30:00.000Z",
    kind: "timezone",
    ...overrides,
  };
}

export function makeStoredProposal(overrides: Partial<StoredSlotProposal> = {}): StoredSlotProposal {
  return {
    taskId: "task_1",
    slots: [{ start: "2026-09-24T07:00:00.000Z", end: "2026-09-24T08:00:00.000Z" }],
    createdAt: "2026-09-23T08:30:00.000Z",
    expiresAt: "2026-09-24T08:30:00.000Z",
    ...overrides,
  };
}

export function makePendingInput(overrides: Partial<PendingInput> = {}): PendingInput {
  return {
    userId: "user_1",
    chatId: 1001,
    promptMessageId: 501,
    purpose: "task_edit",
    refId: "task_1",
    expiresAt: "2026-09-23T09:00:00.000Z",
    ...overrides,
  };
}

export function makeRescheduleCountRecord(
  overrides: Partial<RescheduleCountRecord> = {},
): RescheduleCountRecord {
  return {
    id: "memory_1",
    recordedAt: "2026-09-24T10:00:00.000Z",
    confirmedByUser: true,
    kind: "reschedule_count",
    taskId: "task_1",
    count: 2,
    ...overrides,
  };
}
