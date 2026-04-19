import { describe, it, expect } from "vitest";
import { newGame, applyMove } from "../src/game";
import { renderSvg } from "../src/rendering/svg";

describe("renderSvg", () => {
  it("starts with an <svg> element", () => {
    expect(renderSvg(newGame(), "white").trimStart().startsWith("<svg")).toBe(true);
  });

  it("contains 64 square rects", () => {
    const svg = renderSvg(newGame(), "white");
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    // 64 squares + possibly 2 highlight rects when lastMove present;
    // here lastMove is undefined, so exactly 64.
    expect(rectCount).toBe(64);
  });

  it("contains piece glyphs for the starting position", () => {
    const svg = renderSvg(newGame(), "white");
    expect(svg).toContain("♔"); // white king
    expect(svg).toContain("♚"); // black king
  });

  it("white and black perspectives produce different output", () => {
    expect(renderSvg(newGame(), "white")).not.toBe(renderSvg(newGame(), "black"));
  });

  it("highlights last-move squares when lastMove provided", () => {
    const { fen } = applyMove(newGame(), "e2", "e4");
    const withHighlight = renderSvg(fen, "black", "e2e4");
    const withoutHighlight = renderSvg(fen, "black");
    expect(withHighlight).not.toBe(withoutHighlight);
    // 64 base + 2 highlights
    const rectCount = (withHighlight.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(66);
  });
});
