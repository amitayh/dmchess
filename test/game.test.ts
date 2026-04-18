import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { newGame, turn, applyMove } from "../src/game";

const STARTING_FEN = new Chess().fen();

describe("game", () => {
  it("newGame returns the standard starting FEN", () => {
    expect(newGame()).toBe(STARTING_FEN);
  });

  it("turn of newGame is white", () => {
    expect(turn(newGame())).toBe("white");
  });

  it("applyMove returns new FEN, UCI move, and next turn", () => {
    const result = applyMove(newGame(), "e2", "e4");
    expect(result.move).toBe("e2e4");
    expect(result.turn).toBe("black");
    // After 1.e4, the e-pawn is on e4 and e2 is empty.
    expect(result.fen).toContain("4P3"); // rank 4 has pawn on e-file
    expect(result.fen).not.toBe(newGame());
  });

  it("turn flips after a move", () => {
    const { fen } = applyMove(newGame(), "e2", "e4");
    expect(turn(fen)).toBe("black");
  });

  it("applyMove throws on invalid square notation", () => {
    expect(() => applyMove(newGame(), "zz", "xx")).toThrow();
  });

  it("applyMove throws on illegal move", () => {
    expect(() => applyMove(newGame(), "e2", "e5")).toThrow();
  });

  it("applyMove does not return the input FEN on illegal move", () => {
    const start = newGame();
    expect(() => applyMove(start, "e2", "e5")).toThrow();
    // Calling newGame() again still produces the standard starting FEN —
    // applyMove is pure, it cannot have mutated anything.
    expect(newGame()).toBe(start);
  });
});
