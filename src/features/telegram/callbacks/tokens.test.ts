import { describe, expect, it } from "vitest";
import { createCryptoTokenGenerator, createSequentialTokenGenerator } from "./tokens";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

describe("createCryptoTokenGenerator", () => {
  it("produces 12-character base64url tokens that fit the codec charset", () => {
    const tokens = createCryptoTokenGenerator();
    for (let index = 0; index < 1000; index += 1) {
      const token = tokens.next();
      expect(token).toHaveLength(12);
      expect(token).toMatch(TOKEN_PATTERN);
    }
  });

  it("does not repeat over 1000 tokens", () => {
    const tokens = createCryptoTokenGenerator();
    const seen = new Set(Array.from({ length: 1000 }, () => tokens.next()));
    expect(seen.size).toBe(1000);
  });

  it("is independent between generators", () => {
    expect(createCryptoTokenGenerator().next()).not.toBe(createCryptoTokenGenerator().next());
  });
});

describe("createSequentialTokenGenerator", () => {
  it("is deterministic: tok00001, tok00002, ...", () => {
    const tokens = createSequentialTokenGenerator();
    expect([tokens.next(), tokens.next(), tokens.next()]).toEqual(["tok00001", "tok00002", "tok00003"]);
  });

  it("restarts for every generator", () => {
    createSequentialTokenGenerator().next();
    expect(createSequentialTokenGenerator().next()).toBe("tok00001");
  });

  it("stays valid and unique past five digits", () => {
    const tokens = createSequentialTokenGenerator();
    const seen = new Set<string>();
    for (let index = 0; index < 100_500; index += 1) {
      const token = tokens.next();
      if (index % 5000 === 0 || index > 100_000) expect(token).toMatch(TOKEN_PATTERN);
      seen.add(token);
    }
    expect(seen.size).toBe(100_500);
  });
});
