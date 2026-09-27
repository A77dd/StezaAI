import {
  addMinutes,
  InvalidArgumentError,
  InvalidTransitionError,
  NotFoundError,
  parseInstant,
  SlotConflictError,
} from "../index";
import type {
  BlockBooking,
  NotificationIntensity,
  Slot,
  SlotProposal,
  Task,
  TaskId,
  UserId,
} from "../index";
import type { PersonalFlowPorts } from "./ports";
import { computeProposal, requireSettings, storeProposal } from "./shared";

export type ConfirmSlotInput = {
  readonly userId: UserId;
  readonly taskId: TaskId;
  readonly slotIndex: number;
  readonly slotStart: string;
  readonly slotEnd: string;
};

export type ConfirmSlotResult =
  | { readonly kind: "booked"; readonly task: Task; readonly booking: BlockBooking }
  | { readonly kind: "slot_taken"; readonly proposal: SlotProposal }
  | { readonly kind: "no_such_slot" }
  | { readonly kind: "already_booked"; readonly booking: BlockBooking }
  | { readonly kind: "already_booked_other_slot"; readonly booking: BlockBooking };

type ConfirmSlotPorts = Pick<
  PersonalFlowPorts,
  "tasks" | "proposals" | "calendar" | "reminders" | "settings" | "scheduler" | "clock" | "ids"
>;

/** `settings.notificationIntensity` -> minutes before the block start the `block_start` reminder fires. */
const REMINDER_LEAD_MINUTES: Readonly<Record<NotificationIntensity, number>> = {
  low: 5,
  normal: 10,
  high: 15,
};

/**
 * How many microtask turns to wait for a concurrent winner to finish booking
 * before giving up. All work here is in-memory and microtask-resolved, so a
 * real winner finishes within a handful of turns; this only guards against a
 * genuine bug (a task stuck `scheduled` with no booking) turning into a hang.
 */
const BOOKING_WAIT_ATTEMPTS = 1000;

async function resolveAlreadyBooked(
  ports: ConfirmSlotPorts,
  userId: UserId,
  taskId: TaskId,
  requestedSlot: Slot,
): Promise<ConfirmSlotResult> {
  // The transition that claims "scheduled" happens before the booking is
  // created, so a concurrent winner may not have set `bookingId` yet: wait
  // for it instead of reporting a false "no booking" error.
  let task = await ports.tasks.get(userId, taskId);
  for (
    let attempt = 0;
    task !== null && task.status === "scheduled" && task.bookingId === null && attempt < BOOKING_WAIT_ATTEMPTS;
    attempt += 1
  ) {
    await Promise.resolve();
    task = await ports.tasks.get(userId, taskId);
  }
  if (task === null) {
    throw new NotFoundError(`Task ${taskId} does not exist`);
  }
  if (task.bookingId === null) {
    throw new NotFoundError(`Task ${taskId} is scheduled but has no booking`);
  }
  const booking = await ports.calendar.getBlock(userId, task.bookingId);
  if (booking === null) {
    throw new NotFoundError(`Booking ${task.bookingId} does not exist`);
  }
  const sameSlot = requestedSlot.start === booking.slot.start && requestedSlot.end === booking.slot.end;
  return sameSlot ? { kind: "already_booked", booking } : { kind: "already_booked_other_slot", booking };
}

/** Proposes fresh slots after `after` (the conflicting slot's end) and persists them, even if empty. */
async function regenerateProposal(
  ports: ConfirmSlotPorts,
  userId: UserId,
  task: Task,
  after: string,
): Promise<SlotProposal> {
  const outcome = await computeProposal(ports, { userId, task, now: after });
  const proposal: SlotProposal =
    outcome.kind === "proposed" ? outcome.proposal : { taskId: task.id, slots: [] };
  await storeProposal(ports, userId, proposal);
  return proposal;
}

async function scheduleReminders(ports: ConfirmSlotPorts, userId: UserId, task: Task, slot: Slot): Promise<void> {
  const settings = await requireSettings(ports, userId);
  const chatId = task.source.sourceChatId;
  if (chatId === null) {
    throw new InvalidArgumentError(`Task ${task.id} has no source chat to notify`);
  }
  const now = ports.clock.now();
  const leadMinutes = REMINDER_LEAD_MINUTES[settings.notificationIntensity];
  const blockStartAt = addMinutes(slot.start, -leadMinutes);
  if (parseInstant(blockStartAt) > parseInstant(now)) {
    await ports.reminders.schedule({
      id: ports.ids.next("reminder"),
      userId,
      chatId,
      taskId: task.id,
      kind: "block_start",
      dueAt: blockStartAt,
    });
  }
  await ports.reminders.schedule({
    id: ports.ids.next("reminder"),
    userId,
    chatId,
    taskId: task.id,
    kind: "check_in",
    dueAt: slot.end,
  });
}

/**
 * Confirms one of the proposed slots. Idempotent and race-safe:
 * - the `proposed -> scheduled` transition is the atomic claim, tried before
 *   anything external happens;
 * - after claiming, the slot is re-verified against the calendar (an external
 *   event may have appeared since the proposal); a conflict, or one surfacing
 *   from `createBlock`, rolls the task back to `proposed` and returns a fresh
 *   `slot_taken` proposal;
 * - any other calendar failure also rolls back to `proposed` and rethrows the
 *   original error: a task is never left `scheduled` without a booking;
 * - a second confirmation of an already-scheduled task never re-books; it
 *   reports the existing booking, telling apart "you clicked the same slot
 *   again" from "someone else's concurrent click won a different slot".
 */
export function createConfirmSlot(ports: ConfirmSlotPorts) {
  return async function confirmSlot(input: ConfirmSlotInput): Promise<ConfirmSlotResult> {
    const { userId, taskId } = input;
    const task = await ports.tasks.get(userId, taskId);
    if (task === null) {
      throw new NotFoundError(`Task ${taskId} does not exist`);
    }
    // Read before any transition attempt: a concurrent winner may delete this
    // proposal before this call finishes, so it is captured now for later.
    const stored = await ports.proposals.get(userId, taskId);

    const requestedSlot: Slot = { start: input.slotStart, end: input.slotEnd };
    if (task.status === "scheduled") {
      return resolveAlreadyBooked(ports, userId, task.id, requestedSlot);
    }

    if (stored === null) {
      throw new NotFoundError(`No slot proposal exists for task ${taskId}`);
    }
    const slot = stored.slots[input.slotIndex];
    if (slot === undefined || slot.start !== requestedSlot.start || slot.end !== requestedSlot.end) {
      return { kind: "no_such_slot" };
    }

    let scheduled: Task;
    try {
      scheduled = await ports.tasks.transition(userId, taskId, ["proposed"], { status: "scheduled" });
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        const latest = await ports.tasks.get(userId, taskId);
        if (latest === null) throw new NotFoundError(`Task ${taskId} does not exist`);
        if (latest.status === "scheduled") {
          return resolveAlreadyBooked(ports, userId, latest.id, requestedSlot);
        }
      }
      throw error;
    }

    const busy = await ports.calendar.getBusyIntervals(userId, slot);
    if (busy.length > 0) {
      await ports.tasks.transition(userId, taskId, ["scheduled"], { status: "proposed" });
      const proposal = await regenerateProposal(ports, userId, scheduled, slot.end);
      return { kind: "slot_taken", proposal };
    }

    let booking: BlockBooking;
    try {
      booking = await ports.calendar.createBlock({ userId, taskId, title: scheduled.title, slot });
    } catch (error) {
      await ports.tasks.transition(userId, taskId, ["scheduled"], { status: "proposed" });
      if (error instanceof SlotConflictError) {
        const proposal = await regenerateProposal(ports, userId, scheduled, slot.end);
        return { kind: "slot_taken", proposal };
      }
      throw error;
    }

    const booked = await ports.tasks.update(userId, taskId, { bookingId: booking.id });
    await scheduleReminders(ports, userId, booked, slot);
    await ports.proposals.delete(userId, taskId);
    return { kind: "booked", task: booked, booking };
  };
}
