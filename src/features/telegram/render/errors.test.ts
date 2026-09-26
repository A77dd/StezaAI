import { describe, expect, it } from "vitest";
import { TelegramLayerError } from "../domain";
import { MessageTooLongError, RenderError } from "./errors";

describe("render errors", () => {
  it("RenderError carries the render_invalid code", () => {
    const error = new RenderError("bad view");

    expect(error).toBeInstanceOf(TelegramLayerError);
    expect(error.code).toBe("render_invalid");
    expect(error.name).toBe("RenderError");
    expect(error.message).toBe("bad view");
  });

  it("MessageTooLongError exposes the limit and the actual length", () => {
    const error = new MessageTooLongError(4096, 5000);

    expect(error).toBeInstanceOf(TelegramLayerError);
    expect(error.code).toBe("render_too_long");
    expect(error.limit).toBe(4096);
    expect(error.actual).toBe(5000);
    expect(error.message).toBe("Message is 5000 characters long; the limit is 4096");
  });

  it("preserves the cause", () => {
    const cause = new TypeError("boom");

    expect(new RenderError("bad", { cause }).cause).toBe(cause);
  });
});
