import { describe, expect, it } from "vitest";
import { compactShortstat } from "./gitinfo.js";

describe("compactShortstat", () => {
  it("compacts the usual git --shortstat line", () => {
    expect(compactShortstat(" 1 file changed, 3 insertions(+)")).toBe("1 file, +3 -0");
    expect(compactShortstat("2 files changed, 10 insertions(+), 5 deletions(-)")).toBe(
      "2 files, +10 -5",
    );
    expect(compactShortstat("1 file changed, 2 deletions(-)")).toBe("1 file, +0 -2");
  });

  it("leaves already-compact or unknown strings alone", () => {
    expect(compactShortstat("1 file, +3 -0")).toBe("1 file, +3 -0");
    expect(compactShortstat("working tree clean")).toBe("working tree clean");
  });
});
