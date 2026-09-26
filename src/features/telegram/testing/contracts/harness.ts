import { afterEach, beforeEach } from "vitest";

/**
 * Contract suites are written against a factory so they fit real adapters
 * (databases, HTTP fakes) as well as in-memory ones: every test gets a fresh
 * subject and its `cleanup` runs afterwards, even when the test fails.
 */
export type ContractSubject<T> = {
  readonly port: T;
  readonly cleanup?: () => Promise<void> | void;
};

export type ContractFactory<T> = () => Promise<ContractSubject<T>> | ContractSubject<T>;

/** Registers per-test setup/teardown and returns a getter for the current port. */
export function useSubject<T>(factory: ContractFactory<T>): () => T {
  let subject: ContractSubject<T> | undefined;
  beforeEach(async () => {
    subject = await factory();
  });
  afterEach(async () => {
    const finished = subject;
    subject = undefined;
    await finished?.cleanup?.();
  });
  return () => {
    if (subject === undefined) {
      throw new Error("Contract subject is only available inside a test");
    }
    return subject.port;
  };
}

/** Resolves with the rejection reason of `promise`, or fails if it resolved. */
export async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  const outcome = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(outcome instanceof Error)) {
    throw new Error("Expected the promise to reject with an Error");
  }
  return outcome;
}

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
