import { randomBytes } from "node:crypto";
import type { TokenGenerator } from "./ports";

/** Production tokens: 9 random bytes as 12 base64url characters (72 bits). */
export function createCryptoTokenGenerator(): TokenGenerator {
  return {
    next: () => randomBytes(9).toString("base64url"),
  };
}

/** Deterministic tokens for tests: `tok00001`, `tok00002`, ... */
export function createSequentialTokenGenerator(): TokenGenerator {
  let counter = 0;
  return {
    next() {
      counter += 1;
      return `tok${String(counter).padStart(5, "0")}`;
    },
  };
}
