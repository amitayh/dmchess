import { describe, it, expect } from "vitest";
import { MOVE_TEXT_REGEX } from "../src/bot";

describe("MOVE_TEXT_REGEX", () => {
  it.each([
    ["e2e4", "e2", "e4"],
    ["e2 e4", "e2", "e4"],
    ["a1h8", "a1", "h8"],
    ["h8a1", "h8", "a1"],
    ["a1 a1", "a1", "a1"], // regex doesn't validate legality; applyMove rejects it later
    ["E2E4", "E2", "E4"], // captures preserve original case; caller lowercases
    ["E2 e4", "E2", "e4"],
    ["A1H8", "A1", "H8"],
  ])("matches %s and captures %s / %s", (input, from, to) => {
    const m = input.match(MOVE_TEXT_REGEX);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(from);
    expect(m![2]).toBe(to);
  });

  it.each([
    ["e2  e4", "double space"],
    ["e9e4", "rank out of range"],
    ["i2e4", "file out of range"],
    ["/e2e4", "slash prefix"],
    ["e2e4 ", "trailing space"],
    [" e2e4", "leading space"],
    ["e2e4 extra", "trailing text"],
    ["e2", "single square"],
    ["", "empty string"],
  ])("does not match %s (%s)", (input) => {
    expect(input.match(MOVE_TEXT_REGEX)).toBeNull();
  });
});
