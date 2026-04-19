import type { Color } from "../game";

export function dynboardUrl(fen: string, perspective: Color): string {
  const params = new URLSearchParams({
    fen,
    board: "brown",
    piece: "neo",
    size: "2",
    coordinates: "1",
    color: perspective,
  });
  return `https://www.chess.com/dynboard?${params}`;
}
