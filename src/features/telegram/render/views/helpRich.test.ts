import { describe, expect, it } from "vitest";
import { makeViewContext } from "../../testing/viewFixtures";
import { helpRichView } from "./helpRich";

describe("helpRichView", () => {
  it("renders the whole help screen as a Rich Markdown card without a keyboard", () => {
    const ctx = makeViewContext();
    const view = helpRichView(
      { availableCommands: ["start", "help", "settings", "export", "deleteme"] },
      ctx,
    );

    expect(view.kind).toBe("rich");
    expect(view.keyboard).toBeNull();
    const markdown = view.markdown;
    expect(markdown).toContain("# Что я умею");
    expect(markdown).toContain("## Команды");
    expect(markdown).toContain("- /start — начать заново");
    expect(markdown).toContain("- /deleteme — удалить мои данные");
    expect(markdown).toContain("@steza_test_bot");
    // Help items are the "what the bot does" bullet list
    expect(markdown).toContain("- Личные задачи");
  });

  it("filters the command list down to what the caller implements", () => {
    const ctx = makeViewContext();
    const view = helpRichView({ availableCommands: ["start", "help"] }, ctx);
    expect(view.markdown).toContain("- /start —");
    expect(view.markdown).toContain("- /help —");
    expect(view.markdown).not.toContain("/export");
  });

  it("rejects an unknown command name", () => {
    const ctx = makeViewContext();
    expect(() => helpRichView({ availableCommands: ["nope" as never] }, ctx)).toThrow(/does not know/);
  });
});
