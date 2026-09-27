import { describe, expect, it } from "vitest";
import type { Instant, ProposalRepository } from "../../domain";
import { makeStoredProposal } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory, Mutable } from "./harness";

/** What the contract needs besides the repository: control over its clock. */
export type ProposalRepositorySubject = {
  readonly repo: ProposalRepository;
  advance(ms: number): Promise<void> | void;
  now(): Instant;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function describeProposalRepositoryContract(
  name: string,
  factory: ContractFactory<ProposalRepositorySubject>,
): void {
  describe(`${name} satisfies the ProposalRepository contract`, () => {
    const subject = useSubject(factory);

    it("saves and reads back a proposal; unknown ids give null", async () => {
      const proposal = makeStoredProposal();
      await expect(subject().repo.save("user_1", proposal)).resolves.toEqual(proposal);
      await expect(subject().repo.get("user_1", "task_1")).resolves.toEqual(proposal);
      await expect(subject().repo.get("user_1", "task_missing")).resolves.toBeNull();
    });

    it("save is an upsert: saving for the same task replaces the previous proposal", async () => {
      await subject().repo.save("user_1", makeStoredProposal());
      const replaced = makeStoredProposal({ slots: [] });
      await subject().repo.save("user_1", replaced);
      await expect(subject().repo.get("user_1", "task_1")).resolves.toEqual(replaced);
    });

    it("keeps users apart, even for the same taskId", async () => {
      await subject().repo.save("user_1", makeStoredProposal());
      await expect(subject().repo.get("user_2", "task_1")).resolves.toBeNull();
    });

    it("expires a proposal at its expiresAt, exactly like a missing one", async () => {
      const proposal = makeStoredProposal({
        createdAt: subject().now(),
        expiresAt: "2026-09-24T08:30:00.000Z",
      });
      await subject().repo.save("user_1", proposal);

      await subject().advance(DAY_MS - 1);
      await expect(subject().repo.get("user_1", "task_1")).resolves.toEqual(proposal);

      await subject().advance(1);
      await expect(subject().repo.get("user_1", "task_1")).resolves.toBeNull();
    });

    describe("delete", () => {
      it("removes the user's own proposal", async () => {
        await subject().repo.save("user_1", makeStoredProposal());
        await subject().repo.delete("user_1", "task_1");
        await expect(subject().repo.get("user_1", "task_1")).resolves.toBeNull();
      });

      it("is idempotent: deleting twice, or a missing proposal, is a no-op", async () => {
        await subject().repo.save("user_1", makeStoredProposal());
        await subject().repo.delete("user_1", "task_1");
        await expect(subject().repo.delete("user_1", "task_1")).resolves.toBeUndefined();
        await expect(subject().repo.delete("user_1", "task_missing")).resolves.toBeUndefined();
      });

      it("never deletes another user's proposal", async () => {
        await subject().repo.save("user_1", makeStoredProposal());
        await subject().repo.delete("user_2", "task_1");
        await expect(subject().repo.get("user_1", "task_1")).resolves.not.toBeNull();
      });
    });

    it("deletes every proposal of one user and reports how many", async () => {
      await subject().repo.save("user_1", makeStoredProposal({ taskId: "task_1" }));
      await subject().repo.save("user_1", makeStoredProposal({ taskId: "task_2" }));
      await subject().repo.save("user_2", makeStoredProposal({ taskId: "task_1" }));

      await expect(subject().repo.deleteAllForUser("user_1")).resolves.toBe(2);
      await expect(subject().repo.get("user_1", "task_1")).resolves.toBeNull();
      await expect(subject().repo.get("user_2", "task_1")).resolves.not.toBeNull();
      await expect(subject().repo.deleteAllForUser("user_1")).resolves.toBe(0);
    });

    it("purgeExpired removes only proposals whose expiresAt has passed", async () => {
      await subject().repo.save(
        "user_1",
        makeStoredProposal({ taskId: "task_1", expiresAt: "2026-09-24T08:30:00.000Z" }),
      );
      await subject().repo.save(
        "user_1",
        makeStoredProposal({ taskId: "task_2", expiresAt: "2026-09-25T08:30:00.000Z" }),
      );

      await expect(subject().repo.purgeExpired("2026-09-24T08:30:00.000Z")).resolves.toBe(1);
      await expect(subject().repo.get("user_1", "task_2")).resolves.not.toBeNull();
      await expect(subject().repo.purgeExpired("2026-09-25T08:30:00.000Z")).resolves.toBe(1);
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const input = makeStoredProposal();
      const saved = await subject().repo.save("user_1", input);
      (saved.slots as Mutable<typeof saved.slots>).length = 0;
      const fetched = await subject().repo.get("user_1", "task_1");
      (fetched?.slots as Mutable<NonNullable<typeof fetched>["slots"]>).push({
        start: "2030-01-01T00:00:00.000Z",
        end: "2030-01-01T01:00:00.000Z",
      });

      await expect(subject().repo.get("user_1", "task_1")).resolves.toEqual(makeStoredProposal());
    });
  });
}
