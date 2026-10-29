import { describe, expect, it } from "vitest";
import { calculate } from "../src/index.js";

describe("calculate", () => {
  it.each([
    ["2+3*4", 14],
    ["2^3^2", 512],
    ["-(1+2)", -3],
    ["-2^2", -4],
    ["(1+2)*3", 9],
    ["1.5*2", 3],
    ["10/4", 2.5],
    ["2*-3", -6],
    [" 1 +  1 ", 2],
  ])("evaluates %s to %d", (expr, expected) => {
    expect(calculate(expr)).toBe(expected);
  });

  it.each(["1/0", "process.exit()", "", "1+", "(1+2", "1 2", "2**3"])(
    "rejects %j",
    (expr) => {
      expect(() => calculate(expr)).toThrow();
    },
  );
});
