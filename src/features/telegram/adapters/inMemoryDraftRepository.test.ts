import { describeDraftRepositoryContract } from "../testing/contracts";
import { createFixedClock } from "./fixedClock";
import { createInMemoryDraftRepository } from "./inMemoryDraftRepository";

describeDraftRepositoryContract("inMemoryDraftRepository", () => {
  const clock = createFixedClock("2026-09-23T08:30:00.000Z");
  return {
    port: {
      repo: createInMemoryDraftRepository({ clock }),
      advance: (ms) => clock.advance(ms / 60_000),
      now: () => clock.now(),
    },
  };
});
