// Reusable contract suites for the domain ports. Each takes a factory that
// returns `{ port, cleanup? }` for a FRESH subject, so real adapters
// (databases, HTTP fakes) can run the same suites as the in-memory ones.
export * from "./calendar.contract";
export * from "./callbackStore.contract";
export * from "./draftRepository.contract";
export * from "./harness";
export * from "./intentParser.contract";
export * from "./memoryRepository.contract";
export * from "./pendingInputRepository.contract";
export * from "./proposalRepository.contract";
export * from "./reminderQueue.contract";
export * from "./settingsRepository.contract";
export * from "./slotScheduler.contract";
export * from "./taskRepository.contract";
