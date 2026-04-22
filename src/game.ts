import { Chess } from "chess.js";

export type Color = "white" | "black";

export type Outcome =
  | { kind: "ongoing"; turn: Color }
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "insufficient-material" }
  | { kind: "draw" }; // generic catch-all from chess.js isDraw(), in practice fifty-move rule

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
  outcome: Outcome;
}

function detectOutcome(chess: Chess): Outcome {
  if (chess.isCheckmate()) {
    // chess.turn() returns whose turn it WOULD be — i.e. the mated side.
    const winner: Color = chess.turn() === "w" ? "black" : "white";
    return { kind: "checkmate", winner };
  }
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isInsufficientMaterial()) return { kind: "insufficient-material" };
  if (chess.isDraw()) return { kind: "draw" };
  return { kind: "ongoing", turn: chess.turn() === "w" ? "white" : "black" };
}

export function applyMove(fen: string, from: string, to: string): MoveResult {
  const chess = new Chess(fen);
  // chess.js v1.x throws on illegal moves and rejects bad squares.
  const move = chess.move({ from, to, promotion: "q" });
  const nextTurn: Color = chess.turn() === "w" ? "white" : "black";
  return {
    fen: chess.fen(),
    move: `${move.from}${move.to}${move.promotion ?? ""}`,
    turn: nextTurn,
    outcome: detectOutcome(chess),
  };
}
