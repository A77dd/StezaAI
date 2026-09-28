import { addMinutes, SlotConflictError } from "../index";
import type { BlockBooking, Intent, Slot, SourceRef, Task, UserId } from "../index";
import type { PersonalFlowPorts } from "./ports";
import { computeProposal, storeProposal } from "./shared";
import type { SlotSearchSummary } from "./shared";

export type BookMeetingResult =
  | { readonly kind: "meeting_booked"; readonly task: Task; readonly booking: BlockBooking }
  | { readonly kind: "meeting_conflict"; readonly task: Task; readonly proposal: import("../index").SlotProposal; readonly search: SlotSearchSummary };

/** Books a clearly-timed forwarded meeting at once; a conflict becomes a choice of nearby slots. */
export function createBookMeeting(
  ports: Pick<PersonalFlowPorts, "tasks" | "proposals" | "settings" | "calendar" | "scheduler" | "reminders" | "clock" | "ids">,
) {
  return async function bookMeeting(input: { readonly userId: UserId; readonly intent: Intent; readonly source: SourceRef }): Promise<BookMeetingResult> {
    if (input.intent.scheduledStartAt == null) throw new Error("A meeting start time is required");
    const settings = await ports.settings.get(input.userId);
    if (settings === null) throw new Error(`User ${input.userId} has no settings; call startUser first`);
    const now = ports.clock.now();
    const durationMinutes = input.intent.durationMinutes ?? settings.defaultBlockMinutes;
    const slot: Slot = { start: input.intent.scheduledStartAt, end: addMinutes(input.intent.scheduledStartAt, durationMinutes) };
    const task: Task = {
      id: ports.ids.next("task"), userId: input.userId, title: input.intent.title, kind: "meeting",
      deadline: null, durationMinutes, ...(input.intent.meetingUrl == null ? {} : { meetingUrl: input.intent.meetingUrl }),
      meetingReminderEnabled: true,
      priority: input.intent.priority, source: input.source, status: "inbox", createdAt: now, bookingId: null,
    };
    await ports.tasks.create(task);

    const makeConflict = async (): Promise<BookMeetingResult> => {
      const outcome = await computeProposal(ports, { userId: input.userId, task, now: slot.end });
      const proposal = outcome.kind === "proposed" ? outcome.proposal : { taskId: task.id, slots: [] };
      await storeProposal(ports, input.userId, proposal);
      const proposedTask = await ports.tasks.transition(input.userId, task.id, ["inbox"], { status: "proposed" });
      return { kind: "meeting_conflict", task: proposedTask, proposal, search: outcome.search };
    };

    const busy = await ports.calendar.getBusyIntervals(input.userId, slot);
    if (busy.length > 0) return makeConflict();

    await ports.tasks.transition(input.userId, task.id, ["inbox"], { status: "scheduled" });
    let booking: BlockBooking;
    try {
      booking = await ports.calendar.createBlock({ userId: input.userId, taskId: task.id, title: task.title, slot });
    } catch (error) {
      await ports.tasks.transition(input.userId, task.id, ["scheduled"], { status: "inbox" });
      if (error instanceof SlotConflictError) return makeConflict();
      throw error;
    }
    const booked = await ports.tasks.update(input.userId, task.id, { bookingId: booking.id });
    const chatId = input.source.sourceChatId;
    if (chatId !== null) {
      const reminderAt = addMinutes(slot.start, -60);
      if (Date.parse(reminderAt) > Date.parse(now)) {
        await ports.reminders.schedule({ id: ports.ids.next("reminder"), userId: input.userId, chatId, taskId: task.id, kind: "block_start", dueAt: reminderAt });
      }
    }
    return { kind: "meeting_booked", task: booked, booking };
  };
}
