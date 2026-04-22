# End-game detection and announcement

## Goal

When a move produces a terminal position, the bot detects the ending and announces the result in the same photo caption that currently says "X to move." Covered states: checkmate, stalemate, insufficient material, and the fifty-move rule. Resignation and draw offers are out of scope. Threefold repetition is also out of scope — see the note under "Approach."

## Approach

`chess.js` exposes `isCheckmate`, `isStalemate`, `isInsufficientMaterial`, `isDraw`, and `isGameOver`. The detection is a handful of branches applied to the same `Chess` instance that already applied the move, so there's no second FEN parse per move.

**Why not threefold repetition:** `chess.js` tracks repetitions in an internal `_positionCount` map that it builds up through successive `.move()` calls on a single `Chess` instance. Our architecture stores only a FEN in the session and does `new Chess(fen)` on every move, which resets that map to empty. Detecting threefold would require persisting a move history in the session and replaying it on every move — a larger change in scope than we want for this feature. Threefold therefore goes undetected; games that reach a repetition can be ended by either player agreeing to `/start` a new game.

The outcome is surfaced on `MoveResult` as a required field `outcome: Outcome`. `Outcome` is a tagged union with one variant per game state, including an `ongoing` variant that carries `turn: Color` — the side to move next. Terminal variants (checkmate, stalemate, etc.) carry no turn field, because the game is over. This replaces the previous `turn` field on `MoveResult`: whose turn is next only has meaning when the game is still live, and the new shape makes that invariant unrepresentable-when-false.

The bot branches on `result.outcome`: for the terminal variants, build a result caption and clear the session; for `ongoing`, current behavior. The photo delivery path is unchanged — one message per move, as today.

## Data model

In `src/game.ts`:

```ts
export type Outcome =
  | { kind: "ongoing"; turn: Color }
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "insufficient-material" }
  | { kind: "draw" };  // generic catch-all from chess.js isDraw(), in practice fifty-move rule
```

`MoveResult` drops the `turn` field and gains `outcome`:

```ts
export interface MoveResult {
  fen: string;
  move: string;
  outcome: Outcome;
}
```

`outcome` kinds are mutually exclusive — exactly one fires per position. The `draw` kind is deliberately generic: `chess.js` has no dedicated `isFiftyMoveRule()` predicate, and we don't want to label something "fifty-move" by process of elimination. Anything `isDraw()` catches but the two specific draw predicates (`isStalemate`, `isInsufficientMaterial`) don't becomes a plain `"draw"` — in practice, a fifty-move draw.

## Detection

In `src/game.ts`, a local helper called by `applyMove` after `chess.move(...)`:

```ts
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
```

`applyMove` returns `{ fen, move, outcome: detectOutcome(chess) }`.

Branch ordering matters: `isDraw()` in `chess.js` is a superset that includes stalemate, insufficient material, and fifty-move rule. Putting the specific predicates first ensures they get their specific kinds; the final `isDraw()` catches only what's left (in practice, the fifty-move rule). The `ongoing` fallthrough runs only when none of the terminal predicates fired — i.e. the game is live.

## Bot flow

In `src/bot.ts`, two pure helpers handle display:

```ts
export function captionFor(lastMove: string, outcome: Outcome): string {
  switch (outcome.kind) {
    case "ongoing":                return `${lastMove}. ${capitalize(outcome.turn)} to move.`;
    case "checkmate":              return `${lastMove}. Checkmate — ${capitalize(outcome.winner)} wins.`;
    case "stalemate":              return `${lastMove}. Stalemate — draw.`;
    case "insufficient-material":  return `${lastMove}. Draw by insufficient material.`;
    case "draw":                   return `${lastMove}. Draw.`;
  }
}

export function perspectiveFor(outcome: Outcome): Color {
  switch (outcome.kind) {
    case "ongoing":   return outcome.turn;
    case "checkmate": return outcome.winner;    // winner's side faces up
    case "stalemate":
    case "insufficient-material":
    case "draw":      return "white";           // arbitrary but deterministic for draws
  }
}
```

`applyMoveAndReply` becomes:

1. Call `applyMove` exactly as today (illegal-move error path unchanged).
2. Build `caption = captionFor(lastMove, result.outcome)`.
3. If `result.outcome.kind !== "ongoing"`, clear the session: `ctx.session.fen = ""`. The next move attempt hits the existing `"No game in progress. Use /start."` branch.
4. `sendBoard` with `result.fen`, perspective `perspectiveFor(result.outcome)`, and the computed caption.

For `ongoing` positions, perspective is the side to move (unchanged from today). For checkmate, the board flips to the winner's side — a small celebratory touch. For draws, perspective defaults to white.

The `/start` command, `/move` command, MOVE_TEXT_REGEX handler, and the catch-all handler are untouched.

`captionFor` and `perspectiveFor` are exported so they can be unit-tested directly, matching the pattern already used for `MOVE_TEXT_REGEX`.

## Files

### `src/game.ts` — modify

- Add `Outcome` type export (including the `ongoing` variant).
- Replace `turn: Color` on `MoveResult` with `outcome: Outcome`.
- Add local `detectOutcome(chess: Chess)` helper that always returns an `Outcome`.
- `applyMove` includes `outcome: detectOutcome(chess)` in its return.

### `src/bot.ts` — modify

- Import `Outcome` (and keep `Color`) from `./game`.
- Export new `captionFor(lastMove, outcome)` and `perspectiveFor(outcome)` helpers.
- `applyMoveAndReply` uses both helpers, and clears the session when `result.outcome.kind !== "ongoing"`.

### `test/game.test.ts` — extend

Existing tests that assert on `result.turn` are updated to assert `result.outcome` is `{ kind: "ongoing", turn: ... }` instead.

New `describe("applyMove outcome", ...)` with one test per terminal outcome kind:

- **Ongoing on a normal move.** `applyMove(newGame(), "e2", "e4").outcome` is `{ kind: "ongoing", turn: "black" }`.
- **Checkmate.** From the Fool's Mate pre-mate FEN `rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2`, play `d8-h4`; assert `{ kind: "checkmate", winner: "black" }`.
- **Stalemate.** From `7k/8/5K1Q/8/8/8/8/8 w - - 0 1`, play `h6-g6`; assert `{ kind: "stalemate" }`.
- **Insufficient material.** From a position where a capture leaves K+B vs K (e.g. `4k3/8/8/8/8/8/3r4/3BK3 w - - 0 1`, play `e1-d2` capturing the rook); assert `{ kind: "insufficient-material" }`.
- **Generic draw (fifty-move).** From a FEN with halfmove clock at 99 and sufficient material on both sides — so the generic `isDraw()` branch is what fires, not `isInsufficientMaterial()` (e.g. `7k/8/5K2/8/8/8/1R6/8 w - - 99 50`, play `b2-b1` to tick the halfmove clock to 100); assert `{ kind: "draw" }`.

### `test/bot.test.ts` — extend

Unit tests for `captionFor`, one per `Outcome` kind (five total — each branch of the switch).

Unit tests for `perspectiveFor`, covering: `ongoing` returns `outcome.turn` (both colors); `checkmate` returns `outcome.winner` (both colors); each draw kind returns `"white"`.

Existing `MOVE_TEXT_REGEX` tests are unchanged.

## Error handling

No new error paths. Illegal-move errors from `chess.js` still surface in `applyMove` and are caught in `applyMoveAndReply` as today. A terminal outcome is a normal return, not an error.

After a terminal outcome (any `kind !== "ongoing"`), the session is cleared. A stray move attempt in the same group afterward produces the existing `"No game in progress. Use /start."` reply — no attempt to re-apply a move to a finished game.

## Out of scope

- **Threefold repetition detection.** Would require persisting a move log in the session so `chess.js` can rebuild its repetition history. Deferred.
- **Fivefold repetition and seventy-five-move rule** as distinct kinds. These also depend on repetition history, so they're deferred along with threefold.
- `/resign` and `/draw` commands (player-initiated endings). Separate feature; adds state for draw offers.
- Claimable draws (requiring a `/claimdraw` command for fifty-move). We chose automatic.
- Announcing check (non-mating). Not an end-game state.
- Auto-starting a new game after a result. User must `/start`.
- PGN export or persisting game history.
- Any changes to `dynboard` rendering, the webhook path, or message delivery.
