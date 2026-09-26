import { describe, expect, it } from "vitest";
import { describeTaskRepositoryContract } from "../testing/contracts";
import { makeTask } from "../testing/domainFixtures";
import { createInMemoryTaskRepository } from "./inMemoryTaskRepository";

describeTaskRepositoryContract("inMemoryTaskRepository", () => ({
  port: createInMemoryTaskRepository(),
}));

describe("inMemoryTaskRepository", () => {
  it("keeps separate state per instance", async () => {
    const a = createInMemoryTaskRepository();
    const b = createInMemoryTaskRepository();
    await a.create(makeTask());
    await expect(b.get("user_1", "task_1")).resolves.toBeNull();
  });
});
