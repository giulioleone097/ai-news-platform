import { describe, expect, it } from "vitest";

import type { EditorDirectory } from "../domain/ports";
import { teamMessages, type TeamMember } from "../domain/team";
import { TeamService } from "./team-service";

function member(id: string, overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id,
    email: `${id}@example.com`,
    role: "editor",
    authorId: `author-${id}`,
    authorName: id,
    status: "active",
    userId: `user-${id}`,
    ...overrides,
  };
}

/** A directory that only stores: every rule under test lives in the service. */
function directoryOf(initial: TeamMember[]) {
  const members = initial.map((item) => ({ ...item }));
  const directory: EditorDirectory = {
    async list() {
      return members.map((item) => ({ ...item }));
    },
    async invite({ email, role, name }) {
      const created = member(`new-${members.length}`, { email, role, authorName: name, status: "invited", userId: null });
      members.push(created);
      return { member: created, emailSent: false };
    },
    async setRole(id, role) {
      const found = members.find((item) => item.id === id);
      if (found) found.role = role;
      return found ? { ...found } : null;
    },
    async remove(id) {
      const index = members.findIndex((item) => item.id === id);
      if (index >= 0) members.splice(index, 1);
      return index >= 0;
    },
  };
  return { directory, members };
}

const admin = member("admin", { role: "admin" });
const other = member("other");

describe("TeamService.invite", () => {
  it("normalises the address, defaults to the editor role and names the author after the address", async () => {
    const { directory, members } = directoryOf([admin]);
    const { member: invited } = await new TeamService(directory).invite({ email: "  Maria.Rossi@Example.COM " });
    expect(invited).toMatchObject({ email: "maria.rossi@example.com", role: "editor", authorName: "maria.rossi", status: "invited" });
    expect(members).toHaveLength(2);
  });

  it("keeps a given display name and role", async () => {
    const { directory } = directoryOf([admin]);
    const { member: invited } = await new TeamService(directory).invite({ email: "a@b.co", role: "admin", name: " Maria Rossi " });
    expect(invited).toMatchObject({ role: "admin", authorName: "Maria Rossi" });
  });

  it.each(["", "no-at-sign", "a@b", "two@@x.co", "spaced out@x.co", `${"a".repeat(250)}@x.co`])("rejects the address %j", async (email) => {
    const { directory } = directoryOf([admin]);
    await expect(new TeamService(directory).invite({ email })).rejects.toThrow(teamMessages.invalidEmail);
  });

  it("rejects an unknown role and a one-letter name", async () => {
    const { directory } = directoryOf([admin]);
    const service = new TeamService(directory);
    await expect(service.invite({ email: "a@b.co", role: "owner" as never })).rejects.toThrow(teamMessages.invalidRole);
    await expect(service.invite({ email: "a@b.co", name: "M" })).rejects.toThrow(teamMessages.invalidName);
  });

  it("does not invite a member twice, whatever the case of the address", async () => {
    const { directory, members } = directoryOf([admin, other]);
    await expect(new TeamService(directory).invite({ email: "OTHER@example.com" })).rejects.toThrow(teamMessages.alreadyMember);
    expect(members).toHaveLength(2);
  });
});

describe("TeamService.setRole", () => {
  it("promotes and demotes while another active admin remains", async () => {
    const { directory } = directoryOf([admin, other]);
    const service = new TeamService(directory);
    expect((await service.setRole("other", "admin")).role).toBe("admin");
    expect((await service.setRole("admin", "editor")).role).toBe("editor");
  });

  it("never demotes the last active admin, and an invited admin does not count as one", async () => {
    const { directory } = directoryOf([admin, member("pending", { role: "admin", status: "invited", userId: null })]);
    await expect(new TeamService(directory).setRole("admin", "editor")).rejects.toThrow(teamMessages.lastAdmin);
  });

  it("reports an unknown member", async () => {
    const { directory } = directoryOf([admin]);
    await expect(new TeamService(directory).setRole("nobody", "admin")).rejects.toThrow(teamMessages.notFound);
  });
});

describe("TeamService.remove", () => {
  it("removes a member and returns who was removed", async () => {
    const { directory, members } = directoryOf([admin, other]);
    expect((await new TeamService(directory).remove("other", { subject: admin.userId! })).email).toBe("other@example.com");
    expect(members.map((item) => item.id)).toEqual(["admin"]);
  });

  it("does not let an admin remove themselves, even with another admin around", async () => {
    const { directory, members } = directoryOf([admin, member("second", { role: "admin" })]);
    await expect(new TeamService(directory).remove("admin", { subject: admin.userId! })).rejects.toThrow(teamMessages.removeSelf);
    expect(members).toHaveLength(2);
  });

  it("recognises the admin by their author too, for an account that signed in with another provider", async () => {
    const { directory } = directoryOf([admin, member("second", { role: "admin" })]);
    await expect(new TeamService(directory).remove("admin", { subject: "google:123", authorId: admin.authorId })).rejects.toThrow(
      teamMessages.removeSelf,
    );
  });

  it("never removes the last active admin", async () => {
    const { directory } = directoryOf([admin, other]);
    // Another caller (the shared API key) is not a member, so only the last-admin rule applies.
    await expect(new TeamService(directory).remove("admin", { subject: "mcp-admin" })).rejects.toThrow(teamMessages.lastAdmin);
  });

  it("removes an invitation that was never used, including an admin one", async () => {
    const { directory, members } = directoryOf([admin, member("pending", { role: "admin", status: "invited", userId: null })]);
    await new TeamService(directory).remove("pending", { subject: admin.userId! });
    expect(members).toHaveLength(1);
  });
});

describe("TeamService.list", () => {
  it("sorts members by address", async () => {
    const { directory } = directoryOf([member("zed"), member("amy")]);
    expect((await new TeamService(directory).list()).map((item) => item.id)).toEqual(["amy", "zed"]);
  });
});
