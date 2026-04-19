import { describe, it, expect } from "vitest";
import { dynboardUrl } from "../src/rendering/dynboard";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("dynboardUrl", () => {
  it("starts with the chess.com dynboard endpoint", () => {
    const url = dynboardUrl(STARTING_FEN, "white");
    expect(url.startsWith("https://www.chess.com/dynboard?")).toBe(true);
  });

  it("round-trips the FEN through the query string", () => {
    const url = new URL(dynboardUrl(STARTING_FEN, "white"));
    expect(url.searchParams.get("fen")).toBe(STARTING_FEN);
  });

  it("flips the board for black perspective", () => {
    const white = new URL(dynboardUrl(STARTING_FEN, "white"));
    const black = new URL(dynboardUrl(STARTING_FEN, "black"));
    expect(white.searchParams.get("flip")).toBe("0");
    expect(black.searchParams.get("flip")).toBe("1");
  });

  it("includes the fixed board/piece/size/coordinates params", () => {
    const url = new URL(dynboardUrl(STARTING_FEN, "white"));
    expect(url.searchParams.get("board")).toBe("brown");
    expect(url.searchParams.get("piece")).toBe("neo");
    expect(url.searchParams.get("size")).toBe("2");
    expect(url.searchParams.get("coordinates")).toBe("1");
  });
});
