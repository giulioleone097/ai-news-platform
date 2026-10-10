import { describe, expect, it } from "vitest";
import { parseUtcDateTimeInput, toUtcDateTimeInput } from "./editorial-datetime";

describe("editorial UTC datetime inputs", () => {
  it("parses datetime-local values as UTC instead of the server timezone", () => {
    expect(parseUtcDateTimeInput("2026-08-09T10:30")).toBe("2026-08-09T10:30:00.000Z");
  });

  it("rejects invalid or normalized calendar dates", () => {
    expect(parseUtcDateTimeInput("2026-02-30T10:30")).toBeNull();
    expect(parseUtcDateTimeInput("2026-08-09T10:30Z")).toBeNull();
  });

  it("formats stored instants for the UTC-labelled input", () => {
    expect(toUtcDateTimeInput("2026-08-09T10:30:00.000Z")).toBe("2026-08-09T10:30");
    expect(toUtcDateTimeInput(null)).toBe("");
  });
});
