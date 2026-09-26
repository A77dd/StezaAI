import { describeMemoryRepositoryContract } from "../testing/contracts";
import { createInMemoryMemoryRepository } from "./inMemoryMemoryRepository";

describeMemoryRepositoryContract("inMemoryMemoryRepository", () => ({
  port: createInMemoryMemoryRepository(),
}));
