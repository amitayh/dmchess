# End-Game Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect terminal game states (checkmate, stalemate, insufficient material, fifty-move-rule draw) in `applyMove`, surface them via an `Outcome` tagged union on `MoveResult`, and have the bot announce the result in its photo caption instead of "X to move." Clear the session on any terminal outcome so the next move prompts the user to `/start`.

**Architecture:** `applyMove` (in `src/game.ts`) probes `chess.js` predicates on the instance it just used to apply the move, returning `outcome: Outcome` where `Outcome` is a tagged union that includes an `ongoing` variant carrying the side-to-move. `MoveResult.turn` is removed — whose turn it is only has meaning while the game is live, and the `ongoing` variant owns that. `src/bot.ts` gains two pure helpers, `captionFor(lastMove, outcome)` and `perspectiveFor(outcome)`, and rewires `applyMoveAndReply` to derive caption and board perspective from the outcome and to clear the session on any non-ongoing outcome.

**Tech Stack:** TypeScript, chess.js, grammY, vitest. No new dependencies.

---

## File Structure

- **Modify** `src/game.ts` — add `Outcome` type export, swap `turn` for `outcome` on `MoveResult`, add a private `detectOutcome` helper, call it from `applyMove`.
- **Modify** `src/bot.ts` — export `captionFor` and `perspectiveFor` helpers; rewire `applyMoveAndReply` to use them and clear the session on terminal outcomes.
- **Modify** `test/game.test.ts` — update the existing "next turn" assertion to the new shape; add a `describe("applyMove outcome", ...)` block with one test per outcome kind.
- **Modify** `test/bot.test.ts` — add `describe("captionFor", ...)` and `describe("perspectiveFor", ...)` blocks.

No new files, no new directories. The existing `turn(fen)` free function in `src/game.ts` is untouched — it's exported but not consumed anywhere (grepped), so cleanup is out of scope here.

Tasks are ordered so that **the code compiles and all tests pass after every task**. Task 1 adds `outcome` alongside `turn` (non-breaking). Task 2 adds the bot helpers but doesn't yet use them (non-breaking). Task 3 rewires the bot and then drops the now-dead `turn` field. Task 4 is manual smoke-testing.

---

## Task 1: Add `Outcome` type and detection in `src/game.ts`

**Files:**
- Modify: `src/game.ts`
- Modify: `test/game.test.ts`

This task adds the new `Outcome` type and the `detectOutcome` helper, and starts returning `outcome` from `applyMove`. To keep the build green, it also keeps the existing `turn` field on `MoveResult` (Task 3 drops it once the bot no longer reads it).

- [ ] **Step 1: Add failing tests for each outcome kind**

Open `test/game.test.ts` and append the following `describe` block at the end of the file (after the closing `});` of the existing `describe("game", ...)` block, still inside the module scope):

```ts
describe("applyMove outcome", () => {
  it("is ongoing on a normal opening move", () => {
    const result = applyMove(newGame(), "e2", "e4");
    expect(result.outcome).toEqual({ kind: "ongoing", turn: "black" });
  });

  it("detects checkmate (Fool's Mate) and names the winner", () => {
    // Position after 1.f3 e5 2.g4 — black to move. Qh4 is mate.
    const preMate =
      "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
    const result = applyMove(preMate, "d8", "h4");
    expect(result.outcome).toEqual({ kind: "checkmate", winner: "black" });
  });

  it("detects stalemate", () => {
    // White to move; Qh6-g6 stalemates the black king on h8.
    const preStalemate = "7k/8/5K1Q/8/8/8/8/8 w - - 0 1";
    const result = applyMove(preStalemate, "h6", "g6");
    expect(result.outcome).toEqual({ kind: "stalemate" });
  });

  it("detects insufficient material after a capture leaves K+B vs K", () => {
    // White king on e1, white bishop on d1, black rook on d2, black king on e8.
    // White captures the rook with Kxd2 → K+B vs K, insufficient material.
    const preInsufficient = "4k3/8/8/8/8/8/3r4/3BK3 w - - 0 1";
    const result = applyMove(preInsufficient, "e1", "d2");
    expect(result.outcome).toEqual({ kind: "insufficient-material" });
  });

  it("detects a generic draw (fifty-move rule) when halfmove clock hits 100", () => {
    // K+R vs K (sufficient material on white's side so isInsufficientMaterial is
    // false). Halfmove clock is 99; a non-capture non-pawn move ticks it to 100.
    const preFiftyMove = "7k/8/5K2/8/8/8/1R6/8 w - - 99 50";
    const result = applyMove(preFiftyMove, "b2", "b1");
    expect(result.outcome).toEqual({ kind: "draw" });
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run test/game.test.ts -t "applyMove outcome"
```

Expected: all five new tests FAIL. The failure mode is `expect(result.outcome).toEqual(...)` failing because `result.outcome` is `undefined` — `MoveResult` doesn't have that field yet.

- [ ] **Step 3: Rewrite `src/game.ts` to add `Outcome` and `detectOutcome`**

Open `src/game.ts` and replace the entire file with:

```ts
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
```

Notes while you paste:
- `Outcome` deliberately has no `threefold-repetition` kind — `chess.js` can't detect it with our architecture (each `applyMove` creates a fresh `Chess`, which resets the internal position-count map). The spec's "Why not threefold repetition" section explains this.
- `detectOutcome`'s branch order matters. `isDraw()` in `chess.js` is a superset that fires for stalemate, insufficient material, *and* fifty-move rule. The specific predicates run first; the final `isDraw()` catches only what's left — in practice, fifty-move.
- `turn` is kept on `MoveResult` in this task so `src/bot.ts` (which reads `result.turn`) continues to compile. Task 3 drops it.

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx vitest run test/game.test.ts -t "applyMove outcome"
```

Expected: all five new tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: every pre-existing test still passes alongside the new ones. `test/game.test.ts` now has 12 tests (7 existing + 5 new); `test/bot.test.ts` and `test/dynboard.test.ts` are unchanged.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add src/game.ts test/game.test.ts
git commit -m "feat(game): detect end-game outcomes in applyMove"
```

---

## Task 2: Add `captionFor` and `perspectiveFor` helpers in `src/bot.ts`

**Files:**
- Modify: `src/bot.ts`
- Modify: `test/bot.test.ts`

This task adds the two pure display helpers with full test coverage. It does **not** yet wire them into `applyMoveAndReply` — that happens in Task 3 so this task stays small and test-first.

- [ ] **Step 1: Add failing tests for `captionFor` and `perspectiveFor`**

Open `test/bot.test.ts`. At the top of the file, add new imports alongside the existing one:

```ts
import { describe, it, expect } from "vitest";
import { MOVE_TEXT_REGEX, captionFor, perspectiveFor } from "../src/bot";
import type { Outcome } from "../src/game";
```

At the end of the file, after the closing `});` of the existing `describe("MOVE_TEXT_REGEX", ...)` block, append:

```ts
describe("captionFor", () => {
  it("ongoing shows next side to move", () => {
    const outcome: Outcome = { kind: "ongoing", turn: "black" };
    expect(captionFor("e2-e4", outcome)).toBe("e2-e4. Black to move.");
  });

  it("checkmate names the winner", () => {
    const outcome: Outcome = { kind: "checkmate", winner: "white" };
    expect(captionFor("f7-f8q", outcome)).toBe("f7-f8q. Checkmate — White wins.");
  });

  it("stalemate reads as a draw", () => {
    expect(captionFor("h6-g6", { kind: "stalemate" })).toBe(
      "h6-g6. Stalemate — draw.",
    );
  });

  it("insufficient material calls it out by name", () => {
    expect(captionFor("e1-d2", { kind: "insufficient-material" })).toBe(
      "e1-d2. Draw by insufficient material.",
    );
  });

  it("generic draw is a bare 'Draw.'", () => {
    expect(captionFor("b2-b1", { kind: "draw" })).toBe("b2-b1. Draw.");
  });
});

describe("perspectiveFor", () => {
  it("ongoing uses the side to move", () => {
    expect(perspectiveFor({ kind: "ongoing", turn: "white" })).toBe("white");
    expect(perspectiveFor({ kind: "ongoing", turn: "black" })).toBe("black");
  });

  it("checkmate uses the winner", () => {
    expect(perspectiveFor({ kind: "checkmate", winner: "white" })).toBe("white");
    expect(perspectiveFor({ kind: "checkmate", winner: "black" })).toBe("black");
  });

  it("draws default to white", () => {
    expect(perspectiveFor({ kind: "stalemate" })).toBe("white");
    expect(perspectiveFor({ kind: "insufficient-material" })).toBe("white");
    expect(perspectiveFor({ kind: "draw" })).toBe("white");
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run test/bot.test.ts
```

Expected: FAIL — test file import fails because `captionFor` and `perspectiveFor` are not exported from `src/bot.ts`.

- [ ] **Step 3: Add the helpers to `src/bot.ts`**

Open `src/bot.ts`. Replace the import line

```ts
import { applyMove, newGame, type Color } from "./game";
```

with

```ts
import { applyMove, newGame, type Color, type Outcome } from "./game";
```

Then, **directly below** the existing `capitalize` function (around line 25), add both helpers:

```ts
export function captionFor(lastMove: string, outcome: Outcome): string {
  switch (outcome.kind) {
    case "ongoing":
      return `${lastMove}. ${capitalize(outcome.turn)} to move.`;
    case "checkmate":
      return `${lastMove}. Checkmate — ${capitalize(outcome.winner)} wins.`;
    case "stalemate":
      return `${lastMove}. Stalemate — draw.`;
    case "insufficient-material":
      return `${lastMove}. Draw by insufficient material.`;
    case "draw":
      return `${lastMove}. Draw.`;
  }
}

export function perspectiveFor(outcome: Outcome): Color {
  switch (outcome.kind) {
    case "ongoing":
      return outcome.turn;
    case "checkmate":
      return outcome.winner; // winner's side faces up
    case "stalemate":
    case "insufficient-material":
    case "draw":
      return "white"; // arbitrary but deterministic for draws
  }
}
```

Do not change anything else in `src/bot.ts` yet — the `applyMoveAndReply` rewire comes in Task 3.

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx vitest run test/bot.test.ts
```

Expected: all tests pass — the existing 17 `MOVE_TEXT_REGEX` tests plus 5 new `captionFor` tests plus 3 new `perspectiveFor` tests.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: everything passes.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

Note: TypeScript's exhaustive-check on the switch is implicit — each `case` returns, and the type of `outcome.kind` is a finite union, so there's no unreachable-after-switch warning. If you add a new `Outcome` kind later, the compiler will warn that the function can return `undefined`.

- [ ] **Step 7: Commit**

```bash
git add src/bot.ts test/bot.test.ts
git commit -m "feat(bot): add captionFor and perspectiveFor helpers"
```

---

## Task 3: Rewire `applyMoveAndReply` and drop `MoveResult.turn`

**Files:**
- Modify: `src/bot.ts`
- Modify: `src/game.ts`
- Modify: `test/game.test.ts`

With both sides of the API in place, switch `applyMoveAndReply` over to the helpers, add session clearing on terminal outcomes, and then remove the now-dead `turn` field from `MoveResult`.

- [ ] **Step 1: Rewrite `applyMoveAndReply` in `src/bot.ts`**

Open `src/bot.ts` and locate `applyMoveAndReply` (currently around lines 36–63). Replace the **entire function body** with this version:

```ts
async function applyMoveAndReply(
  ctx: BotContext,
  from: string,
  to: string,
): Promise<void> {
  if (!ctx.session.fen) {
    await ctx.reply("No game in progress. Use /start.");
    return;
  }

  let result;
  try {
    result = applyMove(ctx.session.fen, from, to);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Invalid move: ${message}`);
    return;
  }

  const lastMove = `${result.move.slice(0, 2)}-${result.move.slice(2)}`;
  const caption = captionFor(lastMove, result.outcome);
  const perspective = perspectiveFor(result.outcome);

  if (result.outcome.kind === "ongoing") {
    ctx.session.fen = result.fen;
  } else {
    ctx.session.fen = "";
  }

  await sendBoard(ctx, result.fen, perspective, caption);
}
```

Key behavior changes:
- The caption and perspective now come from the `Outcome` via the helpers (no more inline `` `${lastMove}. ${capitalize(result.turn)} to move.` ``).
- If the outcome is **not** ongoing (i.e. any terminal kind), `ctx.session.fen` is cleared — the next move in the chat hits the existing `"No game in progress. Use /start."` reply.
- For an ongoing move, `ctx.session.fen` is updated to the new position (unchanged semantics).
- `sendBoard` is called **after** the session write so that the image arriving to the user is what they'll see reflected in any subsequent state.
- `result.turn` is no longer read anywhere in `src/bot.ts`.

- [ ] **Step 2: Verify bot.ts no longer reads `result.turn`**

```bash
git grep -n "result\.turn" -- src/bot.ts
```

Expected: empty output (exit code 1 — `git grep` returns 1 when no match). If there's a hit, you missed replacing it in Step 1.

- [ ] **Step 3: Run the full test suite to confirm no regression**

```bash
npm test
```

Expected: all tests still pass. `test/game.test.ts` still asserts `result.turn === "black"` in the existing `"applyMove returns new FEN, UCI move, and next turn"` test — which continues to pass because `MoveResult.turn` is still there (we drop it in Step 4).

- [ ] **Step 4: Drop `turn` from `MoveResult` and `applyMove`**

Open `src/game.ts`. In the `MoveResult` interface, remove the `turn: Color;` line so it reads:

```ts
export interface MoveResult {
  fen: string;
  move: string; // UCI like "e2e4" or "e7e8q"
  outcome: Outcome;
}
```

In `applyMove`, remove the `nextTurn` computation and the `turn` field in the return. The function becomes:

```ts
export function applyMove(fen: string, from: string, to: string): MoveResult {
  const chess = new Chess(fen);
  // chess.js v1.x throws on illegal moves and rejects bad squares.
  const move = chess.move({ from, to, promotion: "q" });
  return {
    fen: chess.fen(),
    move: `${move.from}${move.to}${move.promotion ?? ""}`,
    outcome: detectOutcome(chess),
  };
}
```

`detectOutcome` stays as-is — it already computes the turn internally for the `ongoing` branch and the winner internally for the `checkmate` branch.

- [ ] **Step 5: Update `test/game.test.ts` to stop asserting on `result.turn`**

The test currently at the top of `describe("game", ...)`:

```ts
it("applyMove returns new FEN, UCI move, and next turn", () => {
  const result = applyMove(newGame(), "e2", "e4");
  expect(result.move).toBe("e2e4");
  expect(result.turn).toBe("black");
  // After 1.e4, the e-pawn is on e4 and e2 is empty.
  expect(result.fen).toContain("4P3"); // rank 4 has pawn on e-file
  expect(result.fen).not.toBe(newGame());
});
```

Replace the body with:

```ts
it("applyMove returns new FEN, UCI move, and ongoing outcome", () => {
  const result = applyMove(newGame(), "e2", "e4");
  expect(result.move).toBe("e2e4");
  expect(result.outcome).toEqual({ kind: "ongoing", turn: "black" });
  // After 1.e4, the e-pawn is on e4 and e2 is empty.
  expect(result.fen).toContain("4P3"); // rank 4 has pawn on e-file
  expect(result.fen).not.toBe(newGame());
});
```

The earlier `describe("applyMove outcome", ...)` block already has a dedicated `"is ongoing on a normal opening move"` test — that's OK, they assert different things (this one is about the full shape of `MoveResult`, the other is about outcome detection specifically). No need to remove either.

No other test references `result.turn`. Verify with:

```bash
git grep -n "result\.turn" -- test/
```

Expected: empty output.

- [ ] **Step 6: Typecheck and test**

```bash
npm run typecheck && npm test
```

Expected: both pass.

If typecheck complains about `MoveResult.turn` anywhere else, grep the whole repo:

```bash
git grep -n "\.turn" -- src/ test/
```

Exclude hits inside the `Outcome` `ongoing` variant (those are expected). `chess.turn()` calls (chess.js's own method) are also expected.

- [ ] **Step 7: Commit**

```bash
git add src/bot.ts src/game.ts test/game.test.ts
git commit -m "feat(bot): announce end-game outcomes, clear session on terminal"
```

---

## Task 4: Manual smoke test

Human-in-the-loop verification against real Telegram. Skip in automated execution; return to it before considering the change shipped.

- [ ] **Step 1: Deploy the new code (or run with a tunnel)**

```bash
npm run deploy
```

Or `npm run dev` + `cloudflared tunnel --url http://localhost:8787`, and re-register the webhook to point at the tunnel URL.

- [ ] **Step 2: Run through each end-game path in a Telegram chat**

For each of the scenarios below, start with `/start` (unless noted) and feed the moves in order. Verify the listed caption appears on the final photo, and that after the terminal caption, a follow-up move attempt produces the expected "No game in progress" reply.

1. **Ongoing (sanity).** `/start` → caption `"New game. White to move."`. Then `e2e4` → caption `"e2-e4. Black to move."`.
2. **Checkmate (Fool's Mate).** `/start`, then `f2f3`, `e7e5`, `g2g4`, `d8h4`. Final caption: `"d8-h4. Checkmate — Black wins."`. Board should appear flipped to black's perspective. Send any move text after (e.g. `a2a4`) → `"No game in progress. Use /start."`.
3. **Stalemate.** You can't easily reach stalemate through a realistic opening; instead, verify by unit test (already covered in Task 1). If you want to see the caption in Telegram, temporarily add a command that force-loads the `7k/8/5K1Q/8/8/8/8/8 w - - 0 1` FEN — but this is optional.
4. **Insufficient material / fifty-move.** Same as stalemate — the interesting verification is in the unit tests. The in-Telegram path is the same code as checkmate, just with different captions.
5. **Illegal move post-terminal.** After checkmate, `e2e4` → `"No game in progress. Use /start."` (session was cleared).
6. **Regression: no terminal.** `/start`, `e2e4`, `e7e5` → each move gets the expected "X to move." caption; session flows normally.

- [ ] **Step 3: Tail logs while playing**

```bash
npx wrangler tail
```

Expected: log lines for each request, no exceptions.

- [ ] **Step 4: Commit any tweaks you discover**

```bash
git status
git add <files>
git commit -m "fix: <what was wrong>"
```

---

## Running the full test suite

At any point:

```bash
npm test
```

**After Task 1:** 12 tests in `game.test.ts` (7 existing + 5 new), 17 in `bot.test.ts`, plus `dynboard.test.ts` unchanged.
**After Task 2:** same `game.test.ts`; `bot.test.ts` grows to 17 + 5 + 3 = 25 tests.
**After Task 3:** same counts (the existing `game.test.ts` test body is rewritten in place, not added).
