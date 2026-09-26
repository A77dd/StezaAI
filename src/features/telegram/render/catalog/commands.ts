/**
 * Commands the help screen can list, in display order. A command is listed
 * only when the caller says it is available, so help never advertises a
 * command that is not implemented yet.
 */
export const HELP_COMMANDS = ["start", "help", "settings", "today", "week", "deleteme", "export"] as const;
export type HelpCommand = (typeof HELP_COMMANDS)[number];
