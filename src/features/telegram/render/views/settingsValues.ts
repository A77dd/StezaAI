/**
 * The `value` a `settings.toggle` button carries, per key. The handler for
 * `settings.toggle` implements the other half of this contract:
 * - `notification_intensity`: a `NotificationIntensity` (`low`, `normal`, `high`);
 * - `block_length`: minutes as a decimal string (`"30"`);
 * - `working_hours`: no value; asks the user for new hours;
 * - `calendar`: `connect` starts the connection, `disconnect` removes it.
 */
export const CALENDAR_CONNECT = "connect";
export const CALENDAR_DISCONNECT = "disconnect";

/** Block lengths offered on the settings screen, in minutes. */
export const BLOCK_LENGTH_OPTIONS = [15, 30, 45, 60] as const;
