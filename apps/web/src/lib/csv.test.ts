import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\t=1", "\r=1"])(
    "neutralizes spreadsheet formula input %j",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("escapes quotes without altering ordinary values", () => {
    expect(csvCell('reader"name@example.com')).toBe('"reader""name@example.com"');
  });
});
