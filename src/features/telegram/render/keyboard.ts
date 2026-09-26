import type { ButtonRow, ButtonSpec, KeyboardSpec } from "./buttonSpec";
import { validateButton } from "./buttons";
import { RenderError } from "./errors";
import { BUTTONS_PER_ROW_LIMIT, KEYBOARD_BUTTONS_LIMIT } from "./limits";

/** A row of 1-8 buttons. */
export function row(...buttons: readonly ButtonSpec[]): ButtonRow {
  assertValidRow(buttons);
  return buttons;
}

/**
 * Inline keyboard of 1+ non-empty rows and at most 100 buttons. The same
 * (action, payload) pair may appear more than once: the callback layer issues
 * a separate token per button, so duplicates cannot collide.
 */
export function keyboard(...rows: readonly ButtonRow[]): KeyboardSpec {
  assertValidKeyboard(rows);
  return rows;
}

function assertValidRow(buttons: ButtonRow): void {
  if (buttons.length === 0) throw new RenderError("A keyboard row cannot be empty");
  if (buttons.length > BUTTONS_PER_ROW_LIMIT) {
    throw new RenderError(`A keyboard row holds at most ${BUTTONS_PER_ROW_LIMIT} buttons`);
  }
}

/**
 * Validates a whole keyboard, including rows and buttons assembled by hand
 * rather than through `row`/`keyboard` and the button constructors.
 */
export function assertValidKeyboard(rows: KeyboardSpec): void {
  if (rows.length === 0) throw new RenderError("A keyboard needs at least one row");
  let total = 0;
  for (const buttons of rows) {
    assertValidRow(buttons);
    for (const button of buttons) validateButton(button);
    total += buttons.length;
  }
  if (total > KEYBOARD_BUTTONS_LIMIT) {
    throw new RenderError(`A keyboard holds at most ${KEYBOARD_BUTTONS_LIMIT} buttons`);
  }
}
