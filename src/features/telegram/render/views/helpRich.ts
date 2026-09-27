import { HELP_COMMANDS, fillPlain } from "../catalog";
import type { HelpCommand } from "../catalog";
import type { RenderedRichMessage } from "../rendered";
import type { ViewContext } from "./context";

export type HelpRichInput = {
  /**
   * Commands the bot really handles right now, from the caller (the command
   * registry). Same contract as `helpView`: help lists only these, in the
   * catalog's fixed order.
   */
  readonly availableCommands: readonly HelpCommand[];
};

function commandsMarkdown(available: readonly HelpCommand[], ctx: ViewContext): string {
  for (const command of available) {
    if (!HELP_COMMANDS.includes(command)) throw new Error("helpRich does not know this command");
  }
  const listed = HELP_COMMANDS.filter((command) => available.includes(command));
  const lines = listed.map((command) => `- /${command} — ${ctx.catalog.help.commandDescriptions[command]}`);
  return [`## ${ctx.catalog.help.commandsTitle}`, ...lines].join("\n");
}

/**
 * `/help` as a Rich Message (Bot API 10.1, research §5.2 USE NOW): the one
 * screen today whose content is long and structured — a heading, a list of
 * what the bot does, an inline hint and the command reference. Interactive
 * cards stay HTML + inline keyboard. Everything rendered here comes from the
 * catalog or the bot username (its charset is `[A-Za-z0-9_]`), so no user
 * input can smuggle Markdown syntax.
 */
export function helpRichView(input: HelpRichInput, ctx: ViewContext): RenderedRichMessage {
  const { help } = ctx.catalog;
  const hint = fillPlain(help.inlineHint, { bot: `@${ctx.botUsername}` });
  const blocks = [
    ["# " + help.title, ...help.items.map((item) => `- ${item}`)].join("\n"),
    `**${hint}**`,
    commandsMarkdown(input.availableCommands, ctx),
  ];
  return { kind: "rich", markdown: blocks.join("\n\n"), keyboard: null };
}
