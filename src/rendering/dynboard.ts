import type { Color } from "../game";

export function dynboardUrl(fen: string, perspective: Color): string {
  const params = new URLSearchParams({
    fen,
    board: "brown",
    piece: "neo",
    size: "2",
    coordinates: "1",
    flip: perspective === "black" ? "1" : "0",
  });
  return `https://www.chess.com/dynboard?${params}`;
}
