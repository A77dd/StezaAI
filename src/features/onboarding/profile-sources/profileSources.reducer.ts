import type {
  ProfileSource,
  ProfileSourcesAction,
  ProfileSourcesState,
  SourceCardState,
} from "./profileSources.types";

export function createInitialProfileSourcesState(
  sources: readonly ProfileSource[],
): ProfileSourcesState {
  return Object.fromEntries(
    sources.map((source) => [source.id, { status: "idle", query: "" }]),
  ) as ProfileSourcesState;
}

function updateSource(
  state: ProfileSourcesState,
  sourceId: ProfileSourcesAction["sourceId"],
  next: SourceCardState,
): ProfileSourcesState {
  return { ...state, [sourceId]: next };
}

export function profileSourcesReducer(
  state: ProfileSourcesState,
  action: ProfileSourcesAction,
): ProfileSourcesState {
  const current = state[action.sourceId];

  switch (action.type) {
    case "queryChanged": {
      if (current.status === "error") {
        return updateSource(state, action.sourceId, {
          status: "error",
          query: action.query,
          message: current.message,
        });
      }

      return updateSource(state, action.sourceId, {
        status: "idle",
        query: action.query,
      });
    }
    case "lookupStarted":
      return updateSource(state, action.sourceId, {
        status: "searching",
        query: action.query,
        requestId: action.requestId,
      });
    case "lookupSucceeded":
      if (
        current.status !== "searching" ||
        current.requestId !== action.requestId
      ) {
        return state;
      }
      return updateSource(state, action.sourceId, {
        status: "found",
        query: current.query,
        profile: action.profile,
      });
    case "lookupFailed":
      if (
        current.status !== "searching" ||
        current.requestId !== action.requestId
      ) {
        return state;
      }
      return updateSource(state, action.sourceId, {
        status: "error",
        query: current.query,
        message: action.message,
      });
    case "profileConfirmed":
      if (current.status !== "found") return state;
      return updateSource(state, action.sourceId, {
        status: "confirmed",
        query: current.query,
        profile: current.profile,
      });
    case "profileRejected":
      if (current.status !== "found") return state;
      return updateSource(state, action.sourceId, {
        status: "idle",
        query: current.query,
      });
  }
}
