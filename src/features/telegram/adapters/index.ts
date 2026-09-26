// Deterministic adapters for the domain ports. `ports.contract.ts` (Vitest
// contract suites) is intentionally not exported here: it is test-only code.
export * from "./fixedClock";
export * from "./idGenerator";
export * from "./inMemoryCalendar";
export * from "./inMemoryMemoryRepository";
export * from "./inMemoryReminderQueue";
export * from "./inMemorySettingsRepository";
export * from "./inMemoryTaskRepository";
export * from "./ruleBasedIntentParser";
export * from "./slotScheduler";
export * from "./stubTranscription";
export * from "./systemClock";
