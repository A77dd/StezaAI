import { addMinutes, InvalidTransitionError, NotFoundError, PENDING_INPUT_TTL_MINUTES } from "../index";
import type { Instant, Intent, SlotProposal, Task, TaskId, TaskPatch, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { computeProposal, requireSettings, storeProposal } from "./shared";
import type { SlotSearchSummary } from "./shared";

export type BeginTaskEditInput = {
  readonly userId: UserId;
  readonly chatId: number;
  readonly taskId: TaskId;
  readonly promptMessageId: number;
};

export type BeginTaskEditResult = { readonly kind: "awaiting_input" };

/** Prompts the user for a free-text correction and remembers what it applies to. */
export function createBeginTaskEdit(ports: Pick<PersonalFlowPorts, "tasks" | "pendingInputs" | "clock">) {
  return async function beginTaskEdit(input: BeginTaskEditInput): Promise<BeginTaskEditResult> {
    const task = await ports.tasks.get(input.userId, input.taskId);
    if (task === null) {
      throw new NotFoundError(`Task ${input.taskId} does not exist`);
    }
    const now = ports.clock.now();
    await ports.pendingInputs.save({
      userId: input.userId,
      chatId: input.chatId,
      promptMessageId: input.promptMessageId,
      purpose: "task_edit",
      refId: input.taskId,
      expiresAt: addMinutes(now, PENDING_INPUT_TTL_MINUTES),
    });
    return { kind: "awaiting_input" };
  };
}

export type ApplyTaskEditInput = {
  readonly userId: UserId;
  readonly chatId: number;
  readonly promptMessageId: number;
  readonly text: string;
};

export type ApplyTaskEditResult =
  | { readonly kind: "no_pending_edit" }
  | { readonly kind: "nothing_changed"; readonly task: Task }
  | { readonly kind: "proposed"; readonly task: Task; readonly proposal: SlotProposal; readonly search: SlotSearchSummary }
  | { readonly kind: "no_slots"; readonly task: Task; readonly search: SlotSearchSummary };

/**
 * Only these statuses can be edited: `inbox`/`proposed` have no booking to
 * touch, `scheduled` has one to cancel first. `cancelled`/`done` are final.
 */
const EDITABLE_STATUSES: readonly Task["status"][] = ["inbox", "proposed", "scheduled"];

/**
 * Re-parses the edit text as a PATCH: a field is applied only when the parser
 * actually found something for it (a non-default value), so a message that
 * only corrects the deadline never blanks out the duration or the title. The
 * task's `kind` is never changed here (that is `chooseIntent`'s job); a
 * `title` override is applied only when the parser recognized new actionable
 * content (`kind !== "info"`), not a bare date/duration/priority phrase.
 */
function buildEditPatch(current: Task, reparsed: Intent): TaskPatch {
  return {
    ...(reparsed.deadline !== null && reparsed.deadline !== current.deadline
      ? { deadline: reparsed.deadline }
      : {}),
    ...(reparsed.durationMinutes !== null && reparsed.durationMinutes !== current.durationMinutes
      ? { durationMinutes: reparsed.durationMinutes }
      : {}),
    ...(reparsed.priority !== "normal" && reparsed.priority !== current.priority
      ? { priority: reparsed.priority }
      : {}),
    ...(reparsed.kind !== "info" && reparsed.title !== current.title ? { title: reparsed.title } : {}),
  };
}

type ApplyTaskEditPorts = Pick<
  PersonalFlowPorts,
  | "tasks"
  | "proposals"
  | "pendingInputs"
  | "settings"
  | "calendar"
  | "scheduler"
  | "reminders"
  | "intentParser"
  | "clock"
>;

/** Re-proposes for `task` and leaves its status consistent with whether a proposal now exists. */
async function reproposeAfterEdit(
  ports: ApplyTaskEditPorts,
  userId: UserId,
  task: Task,
  now: Instant,
): Promise<ApplyTaskEditResult> {
  const outcome = await computeProposal(ports, { userId, task, now });
  if (outcome.kind === "no_slots") {
    const final =
      task.status === "proposed"
        ? await ports.tasks.transition(userId, task.id, ["proposed"], { status: "inbox" })
        : task;
    return { kind: "no_slots", task: final, search: outcome.search };
  }
  await storeProposal(ports, userId, outcome.proposal);
  const final =
    task.status === "proposed"
      ? task
      : await ports.tasks.transition(userId, task.id, ["inbox"], { status: "proposed" });
  return { kind: "proposed", task: final, proposal: outcome.proposal, search: outcome.search };
}

/**
 * Takes the pending free-text answer for `promptMessageId` (single-use) and
 * applies it as a correction to the task it was opened for. A scheduled
 * task's booking and reminders are cancelled first and its status reset to
 * `proposed`, then a fresh proposal is always computed, so the task never
 * ends up `scheduled` with stale details.
 */
export function createApplyTaskEdit(ports: ApplyTaskEditPorts) {
  return async function applyTaskEdit(input: ApplyTaskEditInput): Promise<ApplyTaskEditResult> {
    const pending = await ports.pendingInputs.consumeByPrompt(input.userId, input.chatId, input.promptMessageId);
    if (pending === null || pending.purpose !== "task_edit") {
      return { kind: "no_pending_edit" };
    }

    const task = await ports.tasks.get(input.userId, pending.refId);
    if (task === null) {
      throw new NotFoundError(`Task ${pending.refId} does not exist`);
    }
    if (!EDITABLE_STATUSES.includes(task.status)) {
      throw new InvalidTransitionError(task.status);
    }

    const settings = await requireSettings(ports, input.userId);
    const reparsed = await ports.intentParser.parse({
      dateTimeHints: [],
      text: input.text,
      now: ports.clock.now(),
      timezone: settings.timezone,
      source: task.source,
    });

    const patch = buildEditPatch(task, reparsed);
    if (Object.keys(patch).length === 0) {
      return { kind: "nothing_changed", task };
    }

    if (task.status === "scheduled") {
      if (task.bookingId !== null) {
        await ports.calendar.deleteBlock(input.userId, task.bookingId);
      }
      await ports.reminders.cancelForTask(input.userId, task.id);
      await ports.tasks.transition(input.userId, task.id, ["scheduled"], {
        status: "proposed",
        bookingId: null,
      });
    }

    const updated = await ports.tasks.update(input.userId, task.id, patch);
    return reproposeAfterEdit(ports, input.userId, updated, ports.clock.now());
  };
}
