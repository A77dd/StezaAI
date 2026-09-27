import { describe, expect, it } from "vitest";
import type { DraftRepository, Instant } from "../../domain";
import { makeDraft } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory, Mutable } from "./harness";

/** What the contract needs besides the repository: control over its clock. */
export type DraftRepositorySubject = {
  readonly repo: DraftRepository;
  advance(ms: number): Promise<void> | void;
  now(): Instant;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function describeDraftRepositoryContract(
  name: string,
  factory: ContractFactory<DraftRepositorySubject>,
): void {
  describe(`${name} satisfies the DraftRepository contract`, () => {
    const subject = useSubject(factory);

    it("saves and reads back a draft; unknown ids give null", async () => {
      const draft = makeDraft();
      await expect(subject().repo.save(draft)).resolves.toEqual(draft);
      await expect(subject().repo.get("user_1", draft.id)).resolves.toEqual(draft);
      await expect(subject().repo.get("user_1", "draft_missing")).resolves.toBeNull();
    });

    it("save is an upsert: saving the same id again replaces it", async () => {
      await subject().repo.save(makeDraft());
      const replaced = makeDraft({ kind: "clarify", intent: null });
      await subject().repo.save(replaced);
      await expect(subject().repo.get("user_1", "draft_1")).resolves.toEqual(replaced);
    });

    it("keeps users apart: another user's draft behaves like a missing one", async () => {
      await subject().repo.save(makeDraft());
      await expect(subject().repo.get("user_2", "draft_1")).resolves.toBeNull();
    });

    it("expires a draft at its expiresAt, exactly like a missing one", async () => {
      const draft = makeDraft({ createdAt: subject().now(), expiresAt: "2026-09-24T08:30:00.000Z" });
      await subject().repo.save(draft);

      await subject().advance(DAY_MS - 1);
      await expect(subject().repo.get("user_1", draft.id)).resolves.toEqual(draft);

      await subject().advance(1);
      await expect(subject().repo.get("user_1", draft.id)).resolves.toBeNull();
    });

    describe("delete", () => {
      it("removes the user's own draft", async () => {
        await subject().repo.save(makeDraft());
        await subject().repo.delete("user_1", "draft_1");
        await expect(subject().repo.get("user_1", "draft_1")).resolves.toBeNull();
      });

      it("is idempotent: deleting twice, or a missing draft, is a no-op", async () => {
        await subject().repo.save(makeDraft());
        await subject().repo.delete("user_1", "draft_1");
        await expect(subject().repo.delete("user_1", "draft_1")).resolves.toBeUndefined();
        await expect(subject().repo.delete("user_1", "draft_missing")).resolves.toBeUndefined();
      });

      it("never deletes another user's draft", async () => {
        await subject().repo.save(makeDraft());
        await subject().repo.delete("user_2", "draft_1");
        await expect(subject().repo.get("user_1", "draft_1")).resolves.not.toBeNull();
      });
    });

    it("deletes every draft of one user and reports how many", async () => {
      await subject().repo.save(makeDraft({ id: "draft_1" }));
      await subject().repo.save(makeDraft({ id: "draft_2" }));
      await subject().repo.save(makeDraft({ id: "draft_3", userId: "user_2" }));

      await expect(subject().repo.deleteAllForUser("user_1")).resolves.toBe(2);
      await expect(subject().repo.get("user_1", "draft_1")).resolves.toBeNull();
      await expect(subject().repo.get("user_2", "draft_3")).resolves.not.toBeNull();
      await expect(subject().repo.deleteAllForUser("user_1")).resolves.toBe(0);
    });

    it("purgeExpired removes only drafts whose expiresAt has passed", async () => {
      await subject().repo.save(makeDraft({ id: "draft_1", expiresAt: "2026-09-24T08:30:00.000Z" }));
      await subject().repo.save(makeDraft({ id: "draft_2", expiresAt: "2026-09-25T08:30:00.000Z" }));

      await expect(subject().repo.purgeExpired("2026-09-24T08:30:00.000Z")).resolves.toBe(1);
      await expect(subject().repo.get("user_1", "draft_2")).resolves.not.toBeNull();
      await expect(subject().repo.purgeExpired("2026-09-25T08:30:00.000Z")).resolves.toBe(1);
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const input = makeDraft();
      const saved = await subject().repo.save(input);
      (saved as Mutable<typeof saved>).kind = "clarify";
      const fetched = await subject().repo.get("user_1", "draft_1");
      (fetched as Mutable<NonNullable<typeof fetched>>).kind = "group_choice";

      await expect(subject().repo.get("user_1", "draft_1")).resolves.toEqual(makeDraft());
    });
  });
}
