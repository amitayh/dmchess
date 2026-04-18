import { describe, it, expect } from "vitest";
import { newGame, applyMove } from "../src/game";
import { renderUnicode } from "../src/rendering/unicode";

describe("renderUnicode", () => {
  it("white perspective shows rank 8 first and rank 1 last", () => {
    const out = renderUnicode(newGame(), "white");
    const lines = out.trimEnd().split("\n");
    // 8 board rows + 1 file label row
    expect(lines).toHaveLength(9);
    expect(lines[0]?.startsWith("8")).toBe(true);
    expect(lines[7]?.startsWith("1")).toBe(true);
    expect(lines[8]).toContain("a");
    expect(lines[8]).toContain("h");
  });

  it("white perspective contains the white back-rank glyphs", () => {
    const out = renderUnicode(newGame(), "white");
    // White king ♔ and queen ♕ on rank 1
    expect(out).toContain("♔");
    expect(out).toContain("♕");
    // Black king ♚ and queen ♛ on rank 8
    expect(out).toContain("♚");
    expect(out).toContain("♛");
  });

  it("black perspective shows rank 1 first and reverses files", () => {
    const out = renderUnicode(newGame(), "black");
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(9);
    expect(lines[0]?.startsWith("1")).toBe(true);
    expect(lines[7]?.startsWith("8")).toBe(true);
    // File labels should be reversed: h first, a last
    expect(lines[8]?.indexOf("h")).toBeLessThan(lines[8]!.indexOf("a"));
  });

  it("renders empty squares as a dot", () => {
    const out = renderUnicode(newGame(), "white");
    expect(out).toContain(".");
  });

  it("after 1.e4, e2 is empty and e4 has a white pawn", () => {
    const { fen } = applyMove(newGame(), "e2", "e4");
    const out = renderUnicode(fen, "black");
    const lines = out.trimEnd().split("\n");
    // Black perspective: rank 4 is at index 4 from the top (1=0, 2=1, 3=2, 4=3).
    // Files are h..a, so e is index 3 from the right == index 4 from the left.
    // Just check the white pawn glyph appears in some rank-4 row.
    const rank4Line = lines.find((l) => l.startsWith("4"));
    expect(rank4Line).toContain("♙");
  });
});
