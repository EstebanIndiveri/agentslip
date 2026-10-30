import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = path.join(process.cwd(), "viewer/src/style.css");
const builderPath = path.join(process.cwd(), "scripts/build-pages.mjs");

function declsFor(css: string, needle: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...stripped.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .filter(([, selector]) => selector.includes(needle))
    .map(([, , body]) => body)
    .join("\n");
}

function sizesToSlip(body: string): boolean {
  return /width:\s*100%/.test(body) && /max-width:\s*100%/.test(body) && /height:\s*auto/.test(body);
}

describe("viewer / pages slip CSS", () => {
  it("sizes img and svg so static <img> slips fit the paper", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    // gh-pages emits <img src="./slips/*.svg">; `.slip svg` alone does not apply.
    expect(sizesToSlip(declsFor(css, ".slip img")), ".slip img must scale to the slip width").toBe(true);
    expect(sizesToSlip(declsFor(css, ".slip svg")), ".slip svg must scale to the slip width").toBe(true);
    expect(sizesToSlip(declsFor(css, ".slip object")), ".slip object must scale (live viewer)").toBe(true);
  });

  it("is the stylesheet the pages builder copies, and pages still emit <img>", () => {
    const builder = fs.readFileSync(builderPath, "utf8");
    expect(builder).toMatch(/viewer\/src\/style\.css/);
    expect(builder).toMatch(/<img src="\.\/slips\//);
  });

  it("gives the 384px SVG a 1:1 desktop column and stays fluid under 480px", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(declsFor(css, ".printer")).toMatch(/max-width:\s*28rem/);
    expect(declsFor(css, ".roll")).toMatch(/max-width:\s*28rem/);
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).toMatch(/@media\s*\(\s*max-width:\s*480px\s*\)/);
    const mobile = [...stripped.matchAll(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{([\s\S]*?)\n\}/g)]
      .map(([, body]) => body)
      .join("\n");
    expect(mobile).toMatch(/max-width:\s*100%/);
  });
});
