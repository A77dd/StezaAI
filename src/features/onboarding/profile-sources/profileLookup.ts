import type { ProfileResult, ProfileSourceId } from "./profileSources.types";

export interface ProfileLookup {
  lookup(sourceId: ProfileSourceId, query: string): Promise<ProfileResult>;
}
