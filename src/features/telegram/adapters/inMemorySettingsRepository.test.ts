import { describeSettingsRepositoryContract } from "../testing/contracts";
import { createInMemorySettingsRepository } from "./inMemorySettingsRepository";

describeSettingsRepositoryContract("inMemorySettingsRepository", () => ({
  port: createInMemorySettingsRepository(),
}));
