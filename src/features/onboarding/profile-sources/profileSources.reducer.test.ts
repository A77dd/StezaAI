import { describe, expect, it } from "vitest";

import { PROFILE_SOURCES } from "./profileSources.config";
import {
  createInitialProfileSourcesState,
  profileSourcesReducer,
} from "./profileSources.reducer";
import type { ProfileResult } from "./profileSources.types";

const githubProfile: ProfileResult = {
  sourceId: "github",
  name: "Профиль разработчика",
  role: "Software Engineer",
  avatarPath: "/onboarding/avatars/profile-violet.svg",
};

describe("profileSourcesReducer", () => {
  it("creates an idle entry for every configured source", () => {
    const state = createInitialProfileSourcesState(PROFILE_SOURCES);

    expect(Object.keys(state)).toEqual([
      "linkedin",
      "hh",
      "github",
      "telegram",
      "setka",
    ]);
    expect(state.github).toEqual({ status: "idle", query: "" });
  });

  it("updates one query without changing the other cards", () => {
    const initial = createInitialProfileSourcesState(PROFILE_SOURCES);
    const next = profileSourcesReducer(initial, {
      type: "queryChanged",
      sourceId: "github",
      query: "@demo",
    });

    expect(next.github).toEqual({ status: "idle", query: "@demo" });
    expect(next.linkedin).toBe(initial.linkedin);
  });

  it("moves a matching request through searching, found, and confirmed", () => {
    const initial = createInitialProfileSourcesState(PROFILE_SOURCES);
    const searching = profileSourcesReducer(initial, {
      type: "lookupStarted",
      sourceId: "github",
      query: "@demo",
      requestId: "request-1",
    });
    const found = profileSourcesReducer(searching, {
      type: "lookupSucceeded",
      sourceId: "github",
      requestId: "request-1",
      profile: githubProfile,
    });
    const confirmed = profileSourcesReducer(found, {
      type: "profileConfirmed",
      sourceId: "github",
    });

    expect(searching.github).toEqual({
      status: "searching",
      query: "@demo",
      requestId: "request-1",
    });
    expect(found.github).toEqual({
      status: "found",
      query: "@demo",
      profile: githubProfile,
    });
    expect(confirmed.github).toEqual({
      status: "confirmed",
      query: "@demo",
      profile: githubProfile,
    });
  });

  it("ignores stale async responses", () => {
    const initial = createInitialProfileSourcesState(PROFILE_SOURCES);
    const searching = profileSourcesReducer(initial, {
      type: "lookupStarted",
      sourceId: "github",
      query: "@latest",
      requestId: "request-2",
    });
    const next = profileSourcesReducer(searching, {
      type: "lookupSucceeded",
      sourceId: "github",
      requestId: "request-1",
      profile: githubProfile,
    });

    expect(next).toBe(searching);
  });

  it("preserves the query through an error, retry, and rejection", () => {
    const initial = createInitialProfileSourcesState(PROFILE_SOURCES);
    const searching = profileSourcesReducer(initial, {
      type: "lookupStarted",
      sourceId: "github",
      query: "error",
      requestId: "request-1",
    });
    const failed = profileSourcesReducer(searching, {
      type: "lookupFailed",
      sourceId: "github",
      requestId: "request-1",
      message: "Профиль не найден",
    });
    const retrying = profileSourcesReducer(failed, {
      type: "lookupStarted",
      sourceId: "github",
      query: "@corrected",
      requestId: "request-2",
    });
    const found = profileSourcesReducer(retrying, {
      type: "lookupSucceeded",
      sourceId: "github",
      requestId: "request-2",
      profile: githubProfile,
    });
    const rejected = profileSourcesReducer(found, {
      type: "profileRejected",
      sourceId: "github",
    });

    expect(failed).toEqual({
      ...initial,
      github: {
        status: "error",
        query: "error",
        message: "Профиль не найден",
      },
    });
    expect(rejected.github).toEqual({ status: "idle", query: "@corrected" });
  });
});
