import { describe, expect, it } from "vitest";
import { InvalidTimeError } from "../domain/errors";
import { createInMemoryReminderQueue } from "./inMemoryReminderQueue";
import { describeReminderQueueContract } from "./ports.contract";

describeReminderQueueContract("inMemoryReminderQueue", createInMemoryReminderQueue);

describe("inMemoryReminderQueue", () => {
  it("rejects a malformed dueAt when scheduling", async () => {
    await expect(
      createInMemoryReminderQueue().schedule({
        id: "reminder_1",
        userId: "user_1",
        chatId: 1001,
        taskId: "task_1",
        kind: "check_in",
        dueAt: "tomorrow",
      }),
    ).rejects.toThrow(InvalidTimeError);
  });

  it("rejects a malformed now when claiming", async () => {
    await expect(createInMemoryReminderQueue().claimDue("soon", 1)).rejects.toThrow(InvalidTimeError);
  });
});
