import { NotFoundError } from "../index";
import type { Task, TaskId, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";

export function createAddMeetingDetails(ports: Pick<PersonalFlowPorts, "tasks">) {
  return async function addMeetingDetails(input: { readonly userId: UserId; readonly taskId: TaskId; readonly details: string }): Promise<Task> {
    const task = await ports.tasks.get(input.userId, input.taskId);
    if (task === null || task.kind !== "meeting") throw new NotFoundError(`Meeting ${input.taskId} does not exist`);
    const addition = input.details.trim();
    if (addition === "") throw new Error("Meeting details cannot be empty");
    const description = [task.description, addition].filter((part): part is string => typeof part === "string" && part.trim() !== "").join("\n\n");
    return ports.tasks.update(input.userId, task.id, { description });
  };
}
