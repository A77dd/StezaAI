/**
 * Personal-flow use-cases (ADR 0002 Task 7a): plain-data, framework-free
 * business logic for the personal scheduling scenario. Every factory takes a
 * `Pick` of `PersonalFlowPorts` and returns an async function; results are
 * discriminated unions of plain data, never Telegram or callback types.
 * `createPersonalFlow` composes all of them for a handler layer to consume.
 */
export * from "./cancelTask";
export * from "./chooseIntent";
export * from "./confirmSlot";
export * from "./deleteUserData";
export * from "./exportUserData";
export * from "./nextSlots";
export * from "./ports";
export * from "./proposeSlots";
export * from "./startUser";
export * from "./submitText";
export * from "./taskEdit";
export * from "./updateSettings";

import { createCancelTask } from "./cancelTask";
import { createChooseIntent } from "./chooseIntent";
import { createConfirmSlot } from "./confirmSlot";
import { createDeleteUserData } from "./deleteUserData";
import { createExportUserData } from "./exportUserData";
import { createNextSlots } from "./nextSlots";
import type { PersonalFlowPorts } from "./ports";
import { createProposeSlots } from "./proposeSlots";
import { createStartUser } from "./startUser";
import { createSubmitText } from "./submitText";
import { createApplyTaskEdit, createBeginTaskEdit } from "./taskEdit";
import {
  createSetBlockLength,
  createSetCalendarConnected,
  createSetNotificationIntensity,
  createSetTimezone,
  createSetWorkingHours,
} from "./updateSettings";

/** Wires every personal-flow use-case to the same ports, for a handler layer to call. */
export function createPersonalFlow(ports: PersonalFlowPorts) {
  return {
    startUser: createStartUser(ports),
    submitText: createSubmitText(ports),
    chooseIntent: createChooseIntent(ports),
    proposeSlots: createProposeSlots(ports),
    confirmSlot: createConfirmSlot(ports),
    nextSlots: createNextSlots(ports),
    beginTaskEdit: createBeginTaskEdit(ports),
    applyTaskEdit: createApplyTaskEdit(ports),
    cancelTask: createCancelTask(ports),
    setTimezone: createSetTimezone(ports),
    setNotificationIntensity: createSetNotificationIntensity(ports),
    setBlockLength: createSetBlockLength(ports),
    setWorkingHours: createSetWorkingHours(ports),
    setCalendarConnected: createSetCalendarConnected(ports),
    exportUserData: createExportUserData(ports),
    deleteUserData: createDeleteUserData(ports),
  };
}

export type PersonalFlow = ReturnType<typeof createPersonalFlow>;
