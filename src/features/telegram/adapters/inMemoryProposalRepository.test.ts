import { describeProposalRepositoryContract } from "../testing/contracts";
import { createFixedClock } from "./fixedClock";
import { createInMemoryProposalRepository } from "./inMemoryProposalRepository";

describeProposalRepositoryContract("inMemoryProposalRepository", () => {
  const clock = createFixedClock("2026-09-23T08:30:00.000Z");
  return {
    port: {
      repo: createInMemoryProposalRepository({ clock }),
      advance: (ms) => clock.advance(ms / 60_000),
      now: () => clock.now(),
    },
  };
});
