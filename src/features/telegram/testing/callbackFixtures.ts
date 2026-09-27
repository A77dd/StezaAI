import { CHECK_IN_REASONS } from "../domain";
import type { CallbackAction, CallbackPayload } from "../callbacks";

// Fake data only: one valid payload per callback action. Ids are deliberately
// long: payloads live server-side, so their size never affects callback_data.
const LONG_ID = `id_${"x".repeat(96)}`;

export const SAMPLE_CALLBACK_PAYLOADS: { readonly [A in CallbackAction]: CallbackPayload<A> } = {
  "slot.pick": {
    taskId: LONG_ID,
    slotIndex: 2,
    slotStart: "2026-09-28T09:30:00.000Z",
    slotEnd: "2026-09-28T10:30:00.000Z",
  },
  "slot.other": { taskId: LONG_ID },
  "calendar.month": { taskId: LONG_ID, year: 2026, month: 10 },
  "calendar.day": { taskId: LONG_ID, year: 2026, month: 10, day: 12 },
  "task.edit": { taskId: LONG_ID },
  "intent.choose": { draftId: LONG_ID, kind: "follow_up" },
  "context.choose": { draftId: LONG_ID, choice: "remember" },
  "checkin.answer": { checkInId: LONG_ID, outcome: "not_started" },
  "checkin.reason": { checkInId: LONG_ID, reason: CHECK_IN_REASONS[0] },
  "settings.toggle": { key: "notification_intensity", value: "quiet" },
  "settings.timezone": { tz: "Europe/Moscow" },
  "data.delete": { decision: "confirm" },
  noop: {},
};
