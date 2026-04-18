import { Chess } from "chess.js";

export type Color = "white" | "black";

export function newGame(): string {
  return new Chess().fen();
}

export function turn(fen: string): Color {
  return new Chess(fen).turn() === "w" ? "white" : "black";
}

export interface MoveResult {
  fen: string;
  move: string; // UCI like "e2e4" or "e7e8q"
  turn: Color;
}

export function applyMove(fen: string, from: string, to: string): MoveResult {
  const chess = new Chess(fen);
  // chess.js v1.x throws on illegal moves and rejects bad squares.
  const move = chess.move({ from, to, promotion: "q" });
  return {
    fen: chess.fen(),
    move: `${move.from}${move.to}${move.promotion ?? ""}`,
    turn: chess.turn() === "w" ? "white" : "black",
  };
}
