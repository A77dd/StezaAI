import { addMinutes, NotFoundError, SlotConflictError } from "../index";
import type { BlockBooking, Instant, Slot, Task, TaskId, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";

export type RescheduleMeetingResult =
  | { readonly kind: "moved"; readonly task: Task; readonly booking: BlockBooking }
  | { readonly kind: "time_missing" }
  | { readonly kind: "time_conflict" };

export type RescheduleMeetingInput =
  | { readonly userId: UserId; readonly taskId: TaskId; readonly text: string }
  /** A time picked on the calendar: the parser is not involved. */
  | { readonly userId: UserId; readonly taskId: TaskId; readonly start: Instant };

/** Updates an existing meeting: either after parsing an explicit free future time, or straight to a picked start. */
export function createRescheduleMeeting(
  ports: Pick<PersonalFlowPorts, "tasks" | "settings" | "calendar" | "reminders" | "intentParser" | "clock" | "ids">,
) {
  return async function rescheduleMeeting(input: RescheduleMeetingInput): Promise<RescheduleMeetingResult> {
    const task = await ports.tasks.get(input.userId, input.taskId);
    if (task === null || task.kind !== "meeting" || task.bookingId === null) throw new NotFoundError(`Booked meeting ${input.taskId} does not exist`);
    const settings = await ports.settings.get(input.userId);
    if (settings === null) throw new NotFoundError(`User ${input.userId} has no settings`);
    let pickedStart: Instant | null;
    if ("start" in input) {
      pickedStart = input.start;
    } else {
      const intent = await ports.intentParser.parse({
        text: `Встреча ${input.text}`,
        now: ports.clock.now(),
        timezone: settings.timezone,
        source: task.source,
        dateTimeHints: [],
      });
      pickedStart = intent.scheduledStartAt ?? null;
    }
    if (pickedStart === null || Date.parse(pickedStart) <= Date.parse(ports.clock.now())) return { kind: "time_missing" };
    const duration = task.durationMinutes ?? settings.defaultBlockMinutes;
    const slot: Slot = { start: pickedStart, end: addMinutes(pickedStart, duration) };
    const current = await ports.calendar.getBlock(input.userId, task.bookingId);
    if (current === null) throw new NotFoundError(`Booking ${task.bookingId} does not exist`);
    if (slot.start === current.slot.start && slot.end === current.slot.end) return { kind: "moved", task, booking: current };
    if ((await ports.calendar.getBusyIntervals(input.userId, slot)).length > 0) return { kind: "time_conflict" };

    let booking: BlockBooking;
    try {
      booking = await ports.calendar.updateBlock(input.userId, task.bookingId, slot);
    } catch (error) {
      if (error instanceof SlotConflictError) return { kind: "time_conflict" };
      throw error;
    }
    await ports.reminders.cancelForTask(input.userId, task.id);
    const updated = await ports.tasks.update(input.userId, task.id, { durationMinutes: duration, meetingReminderEnabled: task.meetingReminderEnabled !== false });
    const reminderAt = addMinutes(slot.start, -60);
    if (updated.meetingReminderEnabled !== false && Date.parse(reminderAt) > Date.parse(ports.clock.now()) && task.source.sourceChatId !== null) {
      await ports.reminders.schedule({ id: ports.ids.next("reminder"), userId: input.userId, chatId: task.source.sourceChatId, taskId: task.id, kind: "block_start", dueAt: reminderAt });
    }
    return { kind: "moved", task: updated, booking };
  };
}
