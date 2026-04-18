import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { newGame, turn } from "../src/game";

const STARTING_FEN = new Chess().fen();

describe("game", () => {
  it("newGame returns the standard starting FEN", () => {
    expect(newGame()).toBe(STARTING_FEN);
  });

  it("turn of newGame is white", () => {
    expect(turn(newGame())).toBe("white");
  });
});
