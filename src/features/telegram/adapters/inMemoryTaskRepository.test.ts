import { describe, expect, it } from "vitest";
import { makeTask } from "../testing/domainFixtures";
import { createInMemoryTaskRepository } from "./inMemoryTaskRepository";
import { describeTaskRepositoryContract } from "./ports.contract";

describeTaskRepositoryContract("inMemoryTaskRepository", createInMemoryTaskRepository);

describe("inMemoryTaskRepository", () => {
  it("keeps separate state per instance", async () => {
    const a = createInMemoryTaskRepository();
    const b = createInMemoryTaskRepository();
    await a.create(makeTask());
    await expect(b.get("task_1")).resolves.toBeNull();
  });

  it("does not let a patch change identity fields at runtime", async () => {
    const repo = createInMemoryTaskRepository();
    await repo.create(makeTask());
    const patch = { id: "task_hacked", userId: "user_2", createdAt: "2030-01-01T00:00:00.000Z" };
    const updated = await repo.update("task_1", patch as never);
    expect(updated).toMatchObject({
      id: "task_1",
      userId: "user_1",
      createdAt: "2026-09-23T08:30:00.000Z",
    });
  });
});
