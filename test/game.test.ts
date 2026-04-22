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

  it("applyMove returns new FEN, UCI move, and ongoing outcome", () => {
    const result = applyMove(newGame(), "e2", "e4");
    expect(result.move).toBe("e2e4");
    expect(result.outcome).toEqual({ kind: "ongoing", turn: "black" });
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

describe("applyMove outcome", () => {
  it("is ongoing on a normal opening move", () => {
    const result = applyMove(newGame(), "e2", "e4");
    expect(result.outcome).toEqual({ kind: "ongoing", turn: "black" });
  });

  it("detects checkmate (Fool's Mate) and names the winner", () => {
    // Position after 1.f3 e5 2.g4 — black to move. Qh4 is mate.
    const preMate =
      "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
    const result = applyMove(preMate, "d8", "h4");
    expect(result.outcome).toEqual({ kind: "checkmate", winner: "black" });
  });

  it("detects stalemate", () => {
    // White to move; Qh6-g6 stalemates the black king on h8.
    const preStalemate = "7k/8/5K1Q/8/8/8/8/8 w - - 0 1";
    const result = applyMove(preStalemate, "h6", "g6");
    expect(result.outcome).toEqual({ kind: "stalemate" });
  });

  it("detects insufficient material after a capture leaves K+B vs K", () => {
    // White king on e1, white bishop on d1, black rook on d2, black king on e8.
    // White captures the rook with Kxd2 → K+B vs K, insufficient material.
    const preInsufficient = "4k3/8/8/8/8/8/3r4/3BK3 w - - 0 1";
    const result = applyMove(preInsufficient, "e1", "d2");
    expect(result.outcome).toEqual({ kind: "insufficient-material" });
  });

  it("detects a generic draw (fifty-move rule) when halfmove clock hits 100", () => {
    // K+R vs K (sufficient material on white's side so isInsufficientMaterial is
    // false). Halfmove clock is 99; a non-capture non-pawn move ticks it to 100.
    const preFiftyMove = "7k/8/5K2/8/8/8/1R6/8 w - - 99 50";
    const result = applyMove(preFiftyMove, "b2", "b1");
    expect(result.outcome).toEqual({ kind: "draw" });
  });
});
