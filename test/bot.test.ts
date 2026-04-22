import { describe, it, expect } from "vitest";
import { MOVE_TEXT_REGEX, captionFor, perspectiveFor } from "../src/bot";
import type { Outcome } from "../src/game";

describe("MOVE_TEXT_REGEX", () => {
  it.each([
    ["e2e4", "e2", "e4"],
    ["e2 e4", "e2", "e4"],
    ["a1h8", "a1", "h8"],
    ["h8a1", "h8", "a1"],
    ["a1 a1", "a1", "a1"], // regex doesn't validate legality; applyMove rejects it later
    ["E2E4", "E2", "E4"], // captures preserve original case; caller lowercases
    ["E2 e4", "E2", "e4"],
    ["A1H8", "A1", "H8"],
  ])("matches %s and captures %s / %s", (input, from, to) => {
    const m = input.match(MOVE_TEXT_REGEX);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(from);
    expect(m![2]).toBe(to);
  });

  it.each([
    ["e2  e4", "double space"],
    ["e9e4", "rank out of range"],
    ["i2e4", "file out of range"],
    ["/e2e4", "slash prefix"],
    ["e2e4 ", "trailing space"],
    [" e2e4", "leading space"],
    ["e2e4 extra", "trailing text"],
    ["e2", "single square"],
    ["", "empty string"],
  ])("does not match %s (%s)", (input) => {
    expect(input.match(MOVE_TEXT_REGEX)).toBeNull();
  });
});

describe("captionFor", () => {
  it("ongoing shows next side to move", () => {
    const outcome: Outcome = { kind: "ongoing", turn: "black" };
    expect(captionFor("e2-e4", outcome)).toBe("e2-e4. Black to move.");
  });

  it("checkmate names the winner", () => {
    const outcome: Outcome = { kind: "checkmate", winner: "white" };
    expect(captionFor("f7-f8q", outcome)).toBe("f7-f8q. Checkmate — White wins.");
  });

  it("stalemate reads as a draw", () => {
    expect(captionFor("h6-g6", { kind: "stalemate" })).toBe(
      "h6-g6. Stalemate — draw.",
    );
  });

  it("insufficient material calls it out by name", () => {
    expect(captionFor("e1-d2", { kind: "insufficient-material" })).toBe(
      "e1-d2. Draw by insufficient material.",
    );
  });

  it("generic draw is a bare 'Draw.'", () => {
    expect(captionFor("b2-b1", { kind: "draw" })).toBe("b2-b1. Draw.");
  });
});

describe("perspectiveFor", () => {
  it("ongoing uses the side to move", () => {
    expect(perspectiveFor({ kind: "ongoing", turn: "white" })).toBe("white");
    expect(perspectiveFor({ kind: "ongoing", turn: "black" })).toBe("black");
  });

  it("checkmate uses the winner", () => {
    expect(perspectiveFor({ kind: "checkmate", winner: "white" })).toBe("white");
    expect(perspectiveFor({ kind: "checkmate", winner: "black" })).toBe("black");
  });

  it("draws default to white", () => {
    expect(perspectiveFor({ kind: "stalemate" })).toBe("white");
    expect(perspectiveFor({ kind: "insufficient-material" })).toBe("white");
    expect(perspectiveFor({ kind: "draw" })).toBe("white");
  });
});
