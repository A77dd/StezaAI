import { describe, expect, it } from "vitest";
import { AlreadyExistsError, NotFoundError } from "../../domain";
import type { Task, TaskRepository } from "../../domain";
import { makeSource, makeTask } from "../domainFixtures";
import { captureRejection, useSubject } from "./harness";
import type { ContractFactory, Mutable } from "./harness";

export function describeTaskRepositoryContract(
  name: string,
  factory: ContractFactory<TaskRepository>,
): void {
  describe(`${name} satisfies the TaskRepository contract`, () => {
    const repo = useSubject(factory);

    it("creates and reads back a task; unknown ids give null", async () => {
      const task = makeTask();
      await expect(repo().create(task)).resolves.toEqual(task);
      await expect(repo().get("user_1", task.id)).resolves.toEqual(task);
      await expect(repo().get("user_1", "task_missing")).resolves.toBeNull();
    });

    it("rejects a duplicate id with AlreadyExistsError", async () => {
      await repo().create(makeTask());
      await expect(repo().create(makeTask({ title: "Другое" }))).rejects.toThrow(AlreadyExistsError);
      await expect(repo().get("user_1", "task_1")).resolves.toMatchObject({
        title: "Подготовить презентацию",
      });
    });

    it("updates fields and returns the new state", async () => {
      await repo().create(makeTask());
      const updated = await repo().update("user_1", "task_1", {
        status: "scheduled",
        bookingId: "booking_1",
      });
      expect(updated).toMatchObject({ id: "task_1", status: "scheduled", bookingId: "booking_1" });
      await expect(repo().get("user_1", "task_1")).resolves.toEqual(updated);
    });

    it("throws NotFoundError when updating an unknown task", async () => {
      await expect(repo().update("user_1", "task_missing", { status: "done" })).rejects.toThrow(
        NotFoundError,
      );
    });

    describe("patch semantics", () => {
      it("skips keys whose value is undefined: they mean 'not provided'", async () => {
        await repo().create(makeTask({ deadline: "2026-09-25T20:59:00.000Z", durationMinutes: 60 }));

        const updated = await repo().update("user_1", "task_1", {
          title: "Новое название",
          deadline: undefined,
          durationMinutes: undefined,
          bookingId: undefined,
        });

        expect(updated).toMatchObject({
          title: "Новое название",
          deadline: "2026-09-25T20:59:00.000Z",
          durationMinutes: 60,
          bookingId: null,
        });
        await expect(repo().get("user_1", "task_1")).resolves.toEqual(updated);
      });

      it("clears a nullable field only with an explicit null", async () => {
        await repo().create(makeTask({ deadline: "2026-09-25T20:59:00.000Z", bookingId: "booking_1" }));

        const updated = await repo().update("user_1", "task_1", { deadline: null, bookingId: null });

        expect(updated.deadline).toBeNull();
        expect(updated.bookingId).toBeNull();
      });

      it("never lets a patch make a nullable field undefined", async () => {
        await repo().create(makeTask());
        const updated = await repo().update("user_1", "task_1", { deadline: undefined });
        expect(updated.deadline).toBeNull();
      });

      it("does not let a patch change identity fields at runtime", async () => {
        await repo().create(makeTask());
        const forged = { id: "task_hacked", userId: "user_2", createdAt: "2030-01-01T00:00:00.000Z" };
        const updated = await repo().update("user_1", "task_1", forged as never);
        expect(updated).toMatchObject({
          id: "task_1",
          userId: "user_1",
          createdAt: "2026-09-23T08:30:00.000Z",
        });
      });
    });

    describe("ownership (task ids come from forgeable callback data)", () => {
      it("user_2 cannot read user_1's task", async () => {
        await repo().create(makeTask());
        await expect(repo().get("user_2", "task_1")).resolves.toBeNull();
      });

      it("user_2 cannot update user_1's task, and it is untouched", async () => {
        await repo().create(makeTask());

        await expect(repo().update("user_2", "task_1", { status: "cancelled" })).rejects.toThrow(
          NotFoundError,
        );

        await expect(repo().get("user_1", "task_1")).resolves.toMatchObject({ status: "inbox" });
      });

      it("does not reveal existence: a foreign task fails exactly like a missing one", async () => {
        await repo().create(makeTask());
        const missing = await captureRejection(repo().update("user_2", "task_missing", { status: "done" }));
        const foreign = await captureRejection(repo().update("user_2", "task_1", { status: "done" }));
        expect(foreign.constructor).toBe(missing.constructor);
        expect(foreign.message.replace("task_1", "ID")).toBe(missing.message.replace("task_missing", "ID"));
      });
    });

    it("lists only the user's tasks ordered by createdAt then id, optionally by status", async () => {
      await repo().create(makeTask({ id: "task_3", createdAt: "2026-09-23T10:00:00.000Z" }));
      await repo().create(makeTask({ id: "task_2", createdAt: "2026-09-23T09:00:00.000Z" }));
      await repo().create(
        makeTask({ id: "task_1", createdAt: "2026-09-23T09:00:00.000Z", status: "done" }),
      );
      await repo().create(makeTask({ id: "task_9", userId: "user_2" }));

      const all = await repo().listByUser("user_1");
      expect(all.map((task) => task.id)).toEqual(["task_1", "task_2", "task_3"]);
      const done = await repo().listByUser("user_1", { status: "done" });
      expect(done.map((task) => task.id)).toEqual(["task_1"]);
    });

    it("deletes every task of one user and reports how many", async () => {
      await repo().create(makeTask({ id: "task_1" }));
      await repo().create(makeTask({ id: "task_2" }));
      await repo().create(makeTask({ id: "task_3", userId: "user_2" }));

      await expect(repo().deleteAllForUser("user_1")).resolves.toBe(2);
      await expect(repo().listByUser("user_1")).resolves.toEqual([]);
      await expect(repo().get("user_2", "task_3")).resolves.not.toBeNull();
      await expect(repo().deleteAllForUser("user_1")).resolves.toBe(0);
    });

    it("exports all of the user's tasks, in every status", async () => {
      await repo().create(makeTask({ id: "task_1", status: "cancelled" }));
      await repo().create(makeTask({ id: "task_2", status: "done" }));
      await repo().create(makeTask({ id: "task_3", userId: "user_2" }));

      const exported = await repo().exportForUser("user_1");
      expect(exported.map((task) => task.id)).toEqual(["task_1", "task_2"]);
    });

    it("returns copies: mutating results or inputs never changes stored state", async () => {
      const input = makeTask({ source: makeSource({ sourceText: "оригинал" }) });
      const created = await repo().create(input);
      (input.source as Mutable<Task["source"]>).sourceText = "изменено входом";
      (created.source as Mutable<Task["source"]>).sourceText = "изменено результатом";
      const fetched = await repo().get("user_1", "task_1");
      (fetched as Mutable<Task>).title = "изменено чтением";
      const listed = await repo().listByUser("user_1");
      (listed[0] as Mutable<Task>).status = "done";
      const exported = await repo().exportForUser("user_1");
      exported.length = 0;

      const stored = await repo().get("user_1", "task_1");
      expect(stored?.source.sourceText).toBe("оригинал");
      expect(stored?.title).toBe("Подготовить презентацию");
      expect(stored?.status).toBe("inbox");
    });
  });
}
