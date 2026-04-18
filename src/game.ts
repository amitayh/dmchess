import { Chess } from "chess.js";

export type Color = "white" | "black";

export function newGame(): string {
  return new Chess().fen();
}

export function turn(fen: string): Color {
  return new Chess(fen).turn() === "w" ? "white" : "black";
}
