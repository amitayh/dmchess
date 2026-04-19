import { Chess } from "chess.js";
import type { Color } from "../game";

const GLYPHS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const SQUARE = 45;
const BOARD = SQUARE * 8;
const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const HIGHLIGHT = "#ffec3d";

function fileIndex(file: string): number {
  return FILES.indexOf(file);
}

export function renderSvg(fen: string, perspective: Color, lastMove?: string): string {
  const rows = new Chess(fen).board();
  const flipped = perspective === "black";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD}" height="${BOARD}" viewBox="0 0 ${BOARD} ${BOARD}">`,
  );

  // Squares: painted by screen position so the standard light/dark pattern is
  // independent of orientation (a1 is always dark on its visual square).
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      const isLight = (sx + sy) % 2 === 0;
      parts.push(
        `<rect x="${sx * SQUARE}" y="${sy * SQUARE}" width="${SQUARE}" height="${SQUARE}" fill="${isLight ? LIGHT : DARK}"/>`,
      );
    }
  }

  // Highlight last move (overlays the base squares).
  if (lastMove && lastMove.length >= 4) {
    const squares: Array<[number, number]> = [
      [fileIndex(lastMove[0]!), parseInt(lastMove[1]!, 10)],
      [fileIndex(lastMove[2]!), parseInt(lastMove[3]!, 10)],
    ];
    for (const [file, rank] of squares) {
      const sx = flipped ? 7 - file : file;
      const sy = flipped ? rank - 1 : 8 - rank;
      parts.push(
        `<rect x="${sx * SQUARE}" y="${sy * SQUARE}" width="${SQUARE}" height="${SQUARE}" fill="${HIGHLIGHT}" fill-opacity="0.5"/>`,
      );
    }
  }

  // Pieces. rows[0] is rank 8, rows[7] is rank 1; rows[r][f] is file a..h.
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = rows[r]?.[f];
      if (!cell) continue;
      const sx = flipped ? 7 - f : f;
      const sy = flipped ? 7 - r : r;
      const cx = sx * SQUARE + SQUARE / 2;
      const cy = sy * SQUARE + SQUARE * 0.75;
      const letter = cell.color === "w" ? cell.type.toUpperCase() : cell.type;
      const glyph = GLYPHS[letter] ?? "?";
      parts.push(
        `<text x="${cx}" y="${cy}" font-size="${SQUARE * 0.8}" text-anchor="middle" font-family="serif">${glyph}</text>`,
      );
    }
  }

  parts.push(`</svg>`);
  return parts.join("");
}
