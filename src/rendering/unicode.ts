import { Chess } from "chess.js";
import type { Color } from "../game";

const GLYPHS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function renderUnicode(fen: string, perspective: Color): string {
  // chess.js board(): rows[0] is rank 8, rows[7] is rank 1.
  // Each row has 8 cells (file a..h). Cell is { type, color } | null.
  const rows = new Chess(fen).board();

  const ranks = perspective === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = perspective === "white" ? FILES : [...FILES].reverse();

  const lines: string[] = [];
  for (const rank of ranks) {
    const row = rows[8 - rank]!; // rank 8 → index 0, rank 1 → index 7
    const cells = perspective === "white" ? row : [...row].reverse();
    const glyphs = cells.map((cell) => {
      if (!cell) return ".";
      const letter = cell.color === "w" ? cell.type.toUpperCase() : cell.type;
      return GLYPHS[letter] ?? "?";
    });
    lines.push(`${rank} ${glyphs.join(" ")}`);
  }
  lines.push(`  ${files.join(" ")}`);
  return lines.join("\n");
}
