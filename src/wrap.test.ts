import { describe, expect, it } from "vitest";
import { oneLine, wrapLine } from "./wrap.js";

describe("wrapLine", () => {
  it("wraps on word boundaries", () => {
    expect(wrapLine("one two three four", 10)).toEqual(["one two", "three four"]);
  });

  it("truncates overlong tokens with ellipsis", () => {
    const lines = wrapLine("abcdefghijklmnopqrstuvwxyz", 8);
    expect(lines).toEqual(["abcdefg…"]);
  });
});

describe("oneLine", () => {
  it("returns a single truncated line", () => {
    expect(oneLine("hello world this is long", 12).length).toBeLessThanOrEqual(12);
  });
});
