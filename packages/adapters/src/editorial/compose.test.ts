import { describe, expect, it } from "vitest";
import { composeAdminEditorialRepository } from "./compose";
import { createMemoryEditorialParts } from "./memory-editorial-repository";

describe("composeAdminEditorialRepository", () => {
  it("puts every port on one object and keeps the helpers of the parts private", async () => {
    const repository = composeAdminEditorialRepository(createMemoryEditorialParts());

    expect((await repository.listPublished({ locale: "en", limit: 1 })).items).toHaveLength(1);
    expect(await repository.listCategoryRecords()).not.toHaveLength(0);
    expect(await repository.listEntities("en")).not.toHaveLength(0);
    expect(await repository.listEntityRecords()).not.toHaveLength(0);
    expect((await repository.listSubscriptions({ locale: "en" })).total).toBe(0);
    expect(Array.isArray(await repository.listPublications("en"))).toBe(true);
    expect(repository.writable).toBe(false);
    expect(Object.keys(repository)).not.toContain("writeCategory");
  });
});
