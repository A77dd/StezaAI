import { describePendingInputRepositoryContract } from "../testing/contracts";
import { createFixedClock } from "./fixedClock";
import { createInMemoryPendingInputRepository } from "./inMemoryPendingInputRepository";

describePendingInputRepositoryContract("inMemoryPendingInputRepository", () => {
  const clock = createFixedClock("2026-09-23T08:30:00.000Z");
  return {
    port: {
      repo: createInMemoryPendingInputRepository({ clock }),
      advance: (ms) => clock.advance(ms / 60_000),
      now: () => clock.now(),
    },
  };
});
