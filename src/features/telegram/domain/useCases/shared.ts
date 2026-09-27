import {
  addMinutes,
  DRAFT_TTL_HOURS,
  MAX_SEARCH_HORIZON_DAYS,
  NotFoundError,
  parseInstant,
  PROPOSAL_TTL_HOURS,
} from "../index";
import type {
  Draft,
  DraftKind,
  Instant,
  Intent,
  SlotProposal,
  SlotSearchExhaustion,
  SourceRef,
  StoredSlotProposal,
  Task,
  UserId,
  UserSettings,
} from "../index";
import type { PersonalFlowPorts } from "./ports";

/**
 * Internal helpers shared by the personal-flow use-cases. Not part of the
 * public barrel (`./index`): handlers depend on the use-case factories, never
 * on these building blocks directly.
 */

/** Below this confidence the parser's guess is not acted on; the user is asked instead. */
export const CLARIFY_THRESHOLD = 0.5;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** Loads the user's settings or fails explicitly: no use-case invents defaults. */
export async function requireSettings(
  ports: Pick<PersonalFlowPorts, "settings">,
  userId: UserId,
): Promise<UserSettings> {
  const settings = await ports.settings.get(userId);
  if (settings === null) {
    throw new NotFoundError(`User ${userId} has no settings; call startUser first`);
  }
  return settings;
}

export type SlotSearchSummary = {
  readonly searchedUntil: Instant;
  readonly exhausted: SlotSearchExhaustion;
};

export type ProposeOutcome =
  | { readonly kind: "proposed"; readonly proposal: SlotProposal; readonly search: SlotSearchSummary }
  | { readonly kind: "no_slots"; readonly search: SlotSearchSummary };

/**
 * Runs the deterministic scheduler for `task`, searching from `now`. The one
 * place that computes the busy-interval window and turns a `SlotSearchResult`
 * into the use-case-level `proposed | no_slots` shape; shared by every
 * use-case that needs a proposal.
 */
export async function computeProposal(
  ports: Pick<PersonalFlowPorts, "settings" | "calendar" | "scheduler">,
  input: {
    readonly userId: UserId;
    readonly task: Pick<Task, "id" | "deadline" | "durationMinutes" | "priority">;
    readonly now: Instant;
  },
): Promise<ProposeOutcome> {
  const settings = await requireSettings(ports, input.userId);
  // The scheduler caps its own search at the deadline or MAX_SEARCH_HORIZON_DAYS,
  // whichever is sooner; the busy query only needs to cover at least that much.
  const horizonEnd = input.task.deadline ?? addMinutes(input.now, MAX_SEARCH_HORIZON_DAYS * MINUTES_PER_DAY);
  // A deadline at or before "now" leaves an empty (or invalid, zero-length)
  // range to query: the scheduler already reports that case via `now >=
  // horizon` without needing any busy intervals.
  const busy =
    parseInstant(horizonEnd) > parseInstant(input.now)
      ? await ports.calendar.getBusyIntervals(input.userId, { start: input.now, end: horizonEnd })
      : [];
  const result = ports.scheduler.propose({ task: input.task, busy, settings, now: input.now });
  const search: SlotSearchSummary = { searchedUntil: result.searchedUntil, exhausted: result.exhausted };
  return result.slots.length === 0
    ? { kind: "no_slots", search }
    : { kind: "proposed", proposal: { taskId: input.task.id, slots: result.slots }, search };
}

/** Persists `proposal` with a fresh `createdAt`/`expiresAt` (upsert). */
export async function storeProposal(
  ports: Pick<PersonalFlowPorts, "proposals" | "clock">,
  userId: UserId,
  proposal: SlotProposal,
): Promise<StoredSlotProposal> {
  const now = ports.clock.now();
  return ports.proposals.save(userId, {
    ...proposal,
    createdAt: now,
    expiresAt: addMinutes(now, PROPOSAL_TTL_HOURS * MINUTES_PER_HOUR),
  });
}

/** Saves a short-lived draft with a fresh id and a 24 hour lifetime. */
export async function saveDraft(
  ports: Pick<PersonalFlowPorts, "drafts" | "clock" | "ids">,
  input: {
    readonly userId: UserId;
    readonly chatId: number;
    readonly intent: Intent | null;
    readonly source: SourceRef;
    readonly dateTimeHints?: readonly Instant[];
    readonly kind: DraftKind;
  },
): Promise<Draft> {
  const now = ports.clock.now();
  const draft: Draft = {
    id: ports.ids.next("draft"),
    userId: input.userId,
    chatId: input.chatId,
    intent: input.intent,
    source: input.source,
    ...(input.dateTimeHints === undefined ? {} : { dateTimeHints: input.dateTimeHints }),
    createdAt: now,
    expiresAt: addMinutes(now, DRAFT_TTL_HOURS * MINUTES_PER_HOUR),
    kind: input.kind,
  };
  await ports.drafts.save(draft);
  return draft;
}

export type TaskProposalOutcome =
  | { readonly kind: "proposed"; readonly task: Task; readonly proposal: SlotProposal; readonly search: SlotSearchSummary }
  | { readonly kind: "no_slots"; readonly task: Task; readonly search: SlotSearchSummary };

/**
 * Creates a task from a resolved `Intent` (status `inbox`), proposes slots for
 * it, and — only when a proposal exists — persists it and transitions the
 * task to `proposed`. Shared by `submitText` and `chooseIntent`, which both
 * reach this point once an intent has a usable, non-`info` kind.
 */
export async function createTaskAndPropose(
  ports: Pick<
    PersonalFlowPorts,
    "tasks" | "proposals" | "settings" | "calendar" | "scheduler" | "clock" | "ids"
  >,
  input: { readonly userId: UserId; readonly intent: Intent; readonly source: SourceRef },
): Promise<TaskProposalOutcome> {
  const now = ports.clock.now();
  const task: Task = {
    id: ports.ids.next("task"),
    userId: input.userId,
    title: input.intent.title,
    kind: input.intent.kind,
    deadline: input.intent.deadline,
    durationMinutes: input.intent.durationMinutes,
    priority: input.intent.priority,
    source: input.source,
    status: "inbox",
    createdAt: now,
    bookingId: null,
  };
  await ports.tasks.create(task);

  const outcome = await computeProposal(ports, { userId: input.userId, task, now });
  if (outcome.kind === "no_slots") {
    return { kind: "no_slots", task, search: outcome.search };
  }
  await storeProposal(ports, input.userId, outcome.proposal);
  const proposed = await ports.tasks.transition(input.userId, task.id, ["inbox"], { status: "proposed" });
  return { kind: "proposed", task: proposed, proposal: outcome.proposal, search: outcome.search };
}
