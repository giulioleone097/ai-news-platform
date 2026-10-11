import { describe, expect, it } from "vitest";
import { teamMessages } from "@atlasnews/core/team/domain/team";
import { TeamService } from "@atlasnews/core/team/application/team-service";
import { MemoryEditorDirectory } from "./memory-editor-directory";

describe("MemoryEditorDirectory", () => {
  it("keeps invitations, role changes and removals in memory, without sharing its records", async () => {
    const directory = new MemoryEditorDirectory();
    const { member, emailSent } = await directory.invite({ email: "a@example.com", role: "editor", name: "Ada" });
    expect(emailSent).toBe(false);
    expect(member).toMatchObject({ status: "invited", userId: null, authorName: "Ada" });

    member.role = "admin";
    expect((await directory.list())[0]!.role).toBe("editor");
    expect(await directory.setRole(member.id, "admin")).toMatchObject({ role: "admin" });
    expect(await directory.setRole("missing", "admin")).toBeNull();
    expect(await directory.remove(member.id)).toBe(true);
    expect(await directory.remove(member.id)).toBe(false);
    expect(await directory.list()).toEqual([]);
  });

  it("refuses a repeated address", async () => {
    const directory = new MemoryEditorDirectory();
    await directory.invite({ email: "a@example.com", role: "editor", name: "Ada" });
    await expect(directory.invite({ email: "a@example.com", role: "admin", name: "Ada" })).rejects.toThrow(teamMessages.alreadyMember);
  });

  it("runs the team rules through the service", async () => {
    const directory = new MemoryEditorDirectory([
      { id: "demo", email: "demo@example.com", role: "admin", authorId: "a1", authorName: "Demo", status: "active", userId: "demo" },
    ]);
    await expect(new TeamService(directory).remove("demo", { subject: "other" })).rejects.toThrow(teamMessages.lastAdmin);
  });
});
