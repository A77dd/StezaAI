/**
 * Port of the update pipeline: remembers which Telegram updates were already
 * taken, so a redelivered update (webhook retry after a timeout, polling
 * resending the last batch) is not handled twice.
 *
 * Semantics an adapter must keep:
 * - `claim` is atomic: of concurrent claims of one id exactly one gets
 *   `"claimed"`.
 * - Ids are remembered as a SET for a bounded time, never as "the highest id
 *   seen": Telegram picks a new random `update_id` after a week without
 *   updates, so a lower id can legitimately be new.
 * - A persistent adapter should also expire a claim that was never released
 *   or completed (a process that died mid-update), otherwise that update is
 *   dropped forever; an in-memory adapter loses claims with the process.
 */
export interface UpdateDeduper {
  /** `"claimed"`: first sighting, the caller handles the update. `"duplicate"`: already taken. */
  claim(updateId: number): Promise<"claimed" | "duplicate">;
  /**
   * Forgets a claim so the update can be handled again (its handling failed
   * and the runtime will retry it). Releasing an unknown id is a no-op.
   */
  release(updateId: number): Promise<void>;
}
