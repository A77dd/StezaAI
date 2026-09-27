import { describe, expect, it } from "vitest";
import type { Instant, PendingInputRepository } from "../../domain";
import { makePendingInput } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory } from "./harness";

/** What the contract needs besides the repository: control over its clock. */
export type PendingInputRepositorySubject = {
  readonly repo: PendingInputRepository;
  advance(ms: number): Promise<void> | void;
  now(): Instant;
};

const MINUTE_MS = 60 * 1000;

export function describePendingInputRepositoryContract(
  name: string,
  factory: ContractFactory<PendingInputRepositorySubject>,
): void {
  describe(`${name} satisfies the PendingInputRepository contract`, () => {
    const subject = useSubject(factory);

    it("saves, peeks and consumes a pending input for its prompt", async () => {
      const input = makePendingInput();
      await expect(subject().repo.save(input)).resolves.toEqual(input);

      await expect(subject().repo.peekByPrompt("user_1", 1001, 501)).resolves.toEqual(input);
      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.toEqual(input);
    });

    it("peeking preserves the input, then consuming it is single-use", async () => {
      await subject().repo.save(makePendingInput());
      await subject().repo.peekByPrompt("user_1", 1001, 501);
      await expect(subject().repo.peekByPrompt("user_1", 1001, 501)).resolves.not.toBeNull();
      await subject().repo.consumeByPrompt("user_1", 1001, 501);

      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.toBeNull();
    });

    it("returns null for an unknown prompt, chat or user", async () => {
      await subject().repo.save(makePendingInput());
      await expect(subject().repo.peekByPrompt("user_1", 1001, 999)).resolves.toBeNull();
      await expect(subject().repo.peekByPrompt("user_1", 2002, 501)).resolves.toBeNull();
      await expect(subject().repo.peekByPrompt("user_2", 1001, 501)).resolves.toBeNull();
      await expect(subject().repo.consumeByPrompt("user_1", 1001, 999)).resolves.toBeNull();
      await expect(subject().repo.consumeByPrompt("user_1", 2002, 501)).resolves.toBeNull();
      await expect(subject().repo.consumeByPrompt("user_2", 1001, 501)).resolves.toBeNull();
      // Still there for the real owner: a foreign attempt did not consume it.
      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.not.toBeNull();
    });

    it("save is an upsert on (userId, chatId, promptMessageId)", async () => {
      await subject().repo.save(makePendingInput({ purpose: "task_edit", refId: "task_1" }));
      await subject().repo.save(makePendingInput({ purpose: "working_hours", refId: "task_9" }));

      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.toMatchObject({
        purpose: "working_hours",
        refId: "task_9",
      });
    });

    it("peekByPrompt on an expired input removes it and returns null", async () => {
      const input = makePendingInput({
        expiresAt: "2026-09-23T09:00:00.000Z",
      });
      await subject().repo.save(input);

      await subject().advance(30 * MINUTE_MS);
      await expect(subject().repo.peekByPrompt("user_1", 1001, 501)).resolves.toBeNull();
      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.toBeNull();
    });

    it("consumeByPrompt at exactly expiresAt is already expired", async () => {
      const input = makePendingInput({ expiresAt: subject().now() });
      await subject().repo.save(input);
      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.toBeNull();
    });

    it("deletes every pending input of one user and reports how many", async () => {
      await subject().repo.save(makePendingInput({ promptMessageId: 1 }));
      await subject().repo.save(makePendingInput({ promptMessageId: 2 }));
      await subject().repo.save(makePendingInput({ promptMessageId: 3, userId: "user_2" }));

      await expect(subject().repo.deleteAllForUser("user_1")).resolves.toBe(2);
      await expect(subject().repo.consumeByPrompt("user_1", 1001, 1)).resolves.toBeNull();
      await expect(subject().repo.consumeByPrompt("user_2", 1001, 3)).resolves.not.toBeNull();
      await expect(subject().repo.deleteAllForUser("user_1")).resolves.toBe(0);
    });

    it("returns copies on save: mutating the input never changes stored state", async () => {
      const input = makePendingInput();
      await subject().repo.save(input);
      (input as { refId: string }).refId = "task_hacked";

      await expect(subject().repo.consumeByPrompt("user_1", 1001, 501)).resolves.toMatchObject({
        refId: "task_1",
      });
    });
  });
}
