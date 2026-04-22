# End-game detection and announcement

## Goal

When a move produces a terminal position, the bot detects the ending and announces the result in the same photo caption that currently says "X to move." All automatic end-game states are covered: checkmate, stalemate, insufficient material, threefold repetition, and the fifty-move rule. Resignation and draw offers are out of scope.

## Approach

`chess.js` already exposes every predicate we need (`isCheckmate`, `isStalemate`, `isInsufficientMaterial`, `isThreefoldRepetition`, `isDraw`, `isGameOver`). The detection is a handful of branches applied to the same `Chess` instance that already applied the move, so there's no second FEN parse per move.

The outcome is surfaced on the existing `MoveResult` as a new field `outcome: Outcome | null`. `null` means the game continues; a non-null value means this move ended the game, and the caller must treat the session as over.

The bot branches on `result.outcome`: if present, build a result caption and clear the session; otherwise, current behavior. The photo delivery path is unchanged — one message per move, as today.

## Data model

In `src/game.ts`:

```ts
export type Outcome =
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "insufficient-material" }
  | { kind: "threefold-repetition" }
  | { kind: "draw" };  // generic catch-all from chess.js isDraw(), e.g. fifty-move rule
```

`MoveResult` gains one field:

```ts
export interface MoveResult {
  fen: string;
  move: string;
  turn: Color;
  outcome: Outcome | null;
}
```

`outcome` kinds are mutually exclusive — at most one fires per position. The `draw` kind is deliberately generic: `chess.js` has no dedicated `isFiftyMoveRule()` predicate, and we don't want to label something "fifty-move" by process of elimination. Anything that `isDraw()` catches but the three specific draw predicates don't becomes a plain `"draw"`.

## Detection

In `src/game.ts`, a local helper called by `applyMove` after `chess.move(...)`:

```ts
function detectOutcome(chess: Chess): Outcome | null {
  if (chess.isCheckmate()) {
    // chess.turn() returns whose turn it WOULD be — i.e. the mated side.
    const winner: Color = chess.turn() === "w" ? "black" : "white";
    return { kind: "checkmate", winner };
  }
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isInsufficientMaterial()) return { kind: "insufficient-material" };
  if (chess.isThreefoldRepetition()) return { kind: "threefold-repetition" };
  if (chess.isDraw()) return { kind: "draw" };
  return null;
}
```

`applyMove` returns `{ fen, move, turn, outcome: detectOutcome(chess) }`.

Branch ordering matters: `isDraw()` in `chess.js` is a superset that includes stalemate, insufficient material, threefold repetition, and fifty-move rule. Putting specific predicates first ensures they get their specific kinds; the final `isDraw()` catches only what's left (in practice, the fifty-move rule).

## Bot flow

In `src/bot.ts`, a pure helper builds the caption:

```ts
export function captionFor(lastMove: string, nextTurn: Color, outcome: Outcome | null): string {
  if (outcome === null) return `${lastMove}. ${capitalize(nextTurn)} to move.`;
  switch (outcome.kind) {
    case "checkmate":              return `${lastMove}. Checkmate — ${capitalize(outcome.winner)} wins.`;
    case "stalemate":              return `${lastMove}. Stalemate — draw.`;
    case "insufficient-material":  return `${lastMove}. Draw by insufficient material.`;
    case "threefold-repetition":   return `${lastMove}. Draw by threefold repetition.`;
    case "draw":                   return `${lastMove}. Draw.`;
  }
}
```

`applyMoveAndReply` becomes:

1. Call `applyMove` exactly as today (illegal-move error path unchanged).
2. Build `caption = captionFor(lastMove, result.turn, result.outcome)`.
3. If `result.outcome !== null`, clear the session: `ctx.session.fen = ""`. The next move attempt hits the existing `"No game in progress. Use /start."` branch.
4. `sendBoard` with `result.fen`, perspective `result.turn`, and the computed caption.

Perspective is intentionally left as `result.turn` (the side that would move next) for terminal positions too. For checkmate this shows the board from the loser's view, which is visually unambiguous given the caption names the winner.

The `/start` command, `/move` command, MOVE_TEXT_REGEX handler, and the catch-all handler are untouched.

`captionFor` is exported so it can be unit-tested directly, matching the pattern already used for `MOVE_TEXT_REGEX`.

## Files

### `src/game.ts` — modify

- Add `Outcome` type export.
- Extend `MoveResult` with `outcome: Outcome | null`.
- Add local `detectOutcome(chess: Chess)` helper.
- `applyMove` includes `outcome: detectOutcome(chess)` in its return.

### `src/bot.ts` — modify

- Import `Outcome` from `./game`.
- Export new `captionFor(lastMove, nextTurn, outcome)` helper.
- `applyMoveAndReply` uses `captionFor` and clears the session on terminal outcome.

### `test/game.test.ts` — extend

New `describe("applyMove outcome", ...)` with one test per outcome kind:

- **No outcome on a normal move.** `applyMove(newGame(), "e2", "e4").outcome` is `null`.
- **Checkmate.** Play Fool's Mate (1. f3 e5 2. g4 Qh4#); assert `{ kind: "checkmate", winner: "black" }`.
- **Stalemate.** From a known stalemate-in-one FEN (e.g. `7k/5Q2/5K2/8/8/8/8/8 w - - 0 1`, play `Qf7`); assert `{ kind: "stalemate" }`.
- **Insufficient material.** From a position where a capture leaves K vs K (or K+B vs K); assert `{ kind: "insufficient-material" }`.
- **Threefold repetition.** Shuffle knights out-and-back twice from the starting position (Nf3/Nf6/Ng1/Ng8 × 2); assert `{ kind: "threefold-repetition" }`.
- **Generic draw (fifty-move).** From a FEN with halfmove clock at 99 and sufficient material on both sides — so the generic `isDraw()` branch is what fires, not `isInsufficientMaterial()` (e.g. `7k/8/5K2/8/8/8/1R6/8 w - - 99 50`, play `Rb1-b2` to tick the halfmove clock to 100); assert `{ kind: "draw" }`.

### `test/bot.test.ts` — extend

Unit tests for `captionFor`, one per branch:

- `null` outcome produces the existing "X. Y to move." format.
- Each `Outcome` kind produces its exact expected caption string (including the winner name for checkmate).

Existing `MOVE_TEXT_REGEX` tests are unchanged.

## Error handling

No new error paths. Illegal-move errors from `chess.js` still surface in `applyMove` and are caught in `applyMoveAndReply` as today. A terminal outcome is a normal return, not an error.

After a terminal outcome, the session is cleared. A stray move attempt in the same group afterward produces the existing `"No game in progress. Use /start."` reply — no attempt to re-apply a move to a finished game.

## Out of scope

- `/resign` and `/draw` commands (player-initiated endings). Separate feature; adds state for draw offers.
- Claimable draws (requiring a `/claimdraw` command for threefold or fifty-move). We chose automatic.
- Distinguishing fivefold repetition or seventy-five-move rule as their own `Outcome` kinds. Covered implicitly by the `draw` catch-all.
- Announcing check (non-mating). Not an end-game state.
- Auto-starting a new game after a result. User must `/start`.
- PGN export or persisting game history.
- Any changes to `dynboard` rendering, the webhook path, or message delivery.
