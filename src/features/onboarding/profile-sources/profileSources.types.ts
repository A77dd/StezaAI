export type ProfileSourceId =
  | "linkedin"
  | "hh"
  | "github"
  | "telegram"
  | "setka";

export type ProfileSource = {
  id: ProfileSourceId;
  name: string;
  description: string;
  mark: string;
  accent: "cyan" | "blue" | "violet" | "mint" | "indigo";
};

export type ProfileResult = {
  sourceId: ProfileSourceId;
  name: string;
  role: string;
  avatarPath: string;
};

export type SourceCardState =
  | { status: "idle"; query: string }
  | { status: "searching"; query: string; requestId: string }
  | { status: "found"; query: string; profile: ProfileResult }
  | { status: "confirmed"; query: string; profile: ProfileResult }
  | { status: "error"; query: string; message: string };

export type ProfileSourcesState = Record<ProfileSourceId, SourceCardState>;

export type ProfileSourcesAction =
  | { type: "queryChanged"; sourceId: ProfileSourceId; query: string }
  | {
      type: "lookupStarted";
      sourceId: ProfileSourceId;
      query: string;
      requestId: string;
    }
  | {
      type: "lookupSucceeded";
      sourceId: ProfileSourceId;
      requestId: string;
      profile: ProfileResult;
    }
  | {
      type: "lookupFailed";
      sourceId: ProfileSourceId;
      requestId: string;
      message: string;
    }
  | { type: "profileConfirmed"; sourceId: ProfileSourceId }
  | { type: "profileRejected"; sourceId: ProfileSourceId };
