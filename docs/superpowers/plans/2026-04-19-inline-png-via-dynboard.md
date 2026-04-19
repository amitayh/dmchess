# Inline PNG via chess.com `dynboard` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-message reply (Unicode `<pre>` + SVG document) with a single inline PNG sourced from `https://www.chess.com/dynboard`.

**Architecture:** A pure URL-builder module produces a `dynboard` URL from a FEN + perspective. `bot.ts` passes that URL string to grammY's `ctx.replyWithPhoto`, and Telegram fetches and CDN-caches the image. The two existing renderer modules (`svg.ts`, `unicode.ts`) are deleted.

**Tech Stack:** TypeScript, grammY, vitest. No new runtime dependencies.

---

## File Structure

- **New** `src/rendering/dynboard.ts` — pure function `dynboardUrl(fen, perspective): string`. No I/O.
- **New** `test/dynboard.test.ts` — unit tests for the URL builder.
- **Modify** `src/bot.ts` — drop the renderer imports, simplify `sendBoard` to one `replyWithPhoto` call, format the caption with the last move.
- **Delete** `src/rendering/svg.ts`, `src/rendering/unicode.ts`, `test/svg.test.ts`, `test/unicode.test.ts`.

The `chess.js` dependency stays — `src/game.ts` still uses it.

---

## Task 1: `dynboard.ts` — URL builder

**Files:**
- Create: `src/rendering/dynboard.ts`
- Test: `test/dynboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/dynboard.test.ts`:

```ts
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

  it("maps perspective to the color param", () => {
    const white = new URL(dynboardUrl(STARTING_FEN, "white"));
    const black = new URL(dynboardUrl(STARTING_FEN, "black"));
    expect(white.searchParams.get("color")).toBe("white");
    expect(black.searchParams.get("color")).toBe("black");
  });

  it("includes the fixed board/piece/size params", () => {
    const url = new URL(dynboardUrl(STARTING_FEN, "white"));
    expect(url.searchParams.get("board")).toBe("brown");
    expect(url.searchParams.get("piece")).toBe("neo");
    expect(url.searchParams.get("size")).toBe("2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/dynboard.test.ts
```

Expected: FAIL — `Cannot find module '../src/rendering/dynboard'` (or equivalent).

- [ ] **Step 3: Implement `src/rendering/dynboard.ts`**

Create `src/rendering/dynboard.ts`:

```ts
import type { Color } from "../game";

export function dynboardUrl(fen: string, perspective: Color): string {
  const params = new URLSearchParams({
    fen,
    board: "brown",
    piece: "neo",
    size: "2",
    color: perspective,
  });
  return `https://www.chess.com/dynboard?${params}`;
}
```

Notes:
- `URLSearchParams` encodes spaces in the FEN as `+` and slashes as `%2F`. The chess.com endpoint accepts both forms — verified by `curl` during spec work.
- `Color` is `"white" | "black"`, defined in `src/game.ts`. Reusing it keeps the bot, game, and renderer in sync.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run test/dynboard.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Verify the full suite still passes (the old renderer tests are still around at this point)**

```bash
npm test
```

Expected: 21 tests pass (7 game + 5 unicode + 5 svg + 4 dynboard).

- [ ] **Step 6: Commit**

```bash
git add src/rendering/dynboard.ts test/dynboard.test.ts
git commit -m "feat(rendering): add chess.com dynboard URL builder"
```

---

## Task 2: `bot.ts` — switch to `replyWithPhoto` with formatted caption

**Files:**
- Modify: `src/bot.ts`

- [ ] **Step 1: Rewrite `src/bot.ts`**

Overwrite `src/bot.ts`:

```ts
import { Bot, session, type Context, type SessionFlavor } from "grammy";
import { KvAdapter } from "@grammyjs/storage-cloudflare";
import { applyMove, newGame, type Color } from "./game";
import { dynboardUrl } from "./rendering/dynboard";

export interface SessionData {
  fen: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GAMES: KVNamespace;
}

const USAGE = "Commands: /start to begin a new game, /move <from> <to> (e.g. /move e2 e4).";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function sendBoard(
  ctx: BotContext,
  fen: string,
  perspective: Color,
  caption: string,
): Promise<void> {
  await ctx.replyWithPhoto(dynboardUrl(fen, perspective), { caption });
}

export function createBot(env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

  bot.use(
    session<SessionData, BotContext>({
      initial: () => ({ fen: "" }),
      storage: new KvAdapter<SessionData>(env.GAMES),
    }),
  );

  bot.command("start", async (ctx) => {
    const fen = newGame();
    ctx.session.fen = fen;
    await sendBoard(ctx, fen, "white", "New game. White to move.");
  });

  bot.command("move", async (ctx) => {
    const args = ctx.match.trim().split(/\s+/).filter(Boolean);
    if (args.length !== 2) {
      await ctx.reply("Usage: /move <from> <to> — e.g. /move e2 e4");
      return;
    }

    if (!ctx.session.fen) {
      await ctx.reply("No game in progress. Use /start.");
      return;
    }

    const [from, to] = args as [string, string];
    let result;
    try {
      result = applyMove(ctx.session.fen, from, to);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Invalid move: ${message}`);
      return;
    }

    ctx.session.fen = result.fen;
    const lastMove = `${result.move.slice(0, 2)}-${result.move.slice(2)}`;
    await sendBoard(
      ctx,
      result.fen,
      result.turn,
      `${lastMove}. ${capitalize(result.turn)} to move.`,
    );
  });

  // Catch-all for any other command.
  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) {
      await ctx.reply(USAGE);
      return;
    }
    await next();
  });

  return bot;
}
```

What changed vs the previous version:
- **Imports**: removed `InputFile`, `renderUnicode`, `renderSvg`. Added `dynboardUrl` and `type Color`.
- **`sendBoard`**: collapsed from two `await`s (text reply + document reply) to one `replyWithPhoto`. Dropped the `lastMove` parameter — the caption now carries that info.
- **Move handler**: builds `lastMove` as `"e2-e4"` (or `"e7-e8q"` for promotions — UCI's optional 5th char rides along on the second slice) and prepends it to the caption.
- **Start handler**: caption text is unchanged (`"New game. White to move."`).

- [ ] **Step 2: Verify it typechecks**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: 21 tests pass (the deletions in Task 3 will trim this to 11).

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): inline PNG via dynboard, last move in caption"
```

---

## Task 3: Delete the unused renderers and their tests

**Files:**
- Delete: `src/rendering/svg.ts`
- Delete: `src/rendering/unicode.ts`
- Delete: `test/svg.test.ts`
- Delete: `test/unicode.test.ts`

After Task 2, nothing imports these modules. Deleting them now keeps the bundle small and the codebase honest.

- [ ] **Step 1: Confirm nothing imports the doomed modules**

```bash
grep -rn "rendering/svg\|rendering/unicode\|renderSvg\|renderUnicode" src test
```

Expected: no output (no remaining references).

If anything turns up, stop and investigate before deleting.

- [ ] **Step 2: Delete the four files**

```bash
git rm src/rendering/svg.ts src/rendering/unicode.ts test/svg.test.ts test/unicode.test.ts
```

Expected: git stages all four deletions.

- [ ] **Step 3: Verify it still typechecks**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: 11 tests pass (7 game + 4 dynboard).

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove SVG and Unicode renderers"
```

---

## Task 4: Manual smoke test (local)

This task isn't code — it's the human-in-the-loop verification that the new flow actually works against real Telegram. Skip this in automated execution; come back to it before considering the change shipped.

- [ ] **Step 1: Start `wrangler dev`**

```bash
npm run dev
```

Expected: prints a local URL and "Ready on …".

- [ ] **Step 2: Expose the local Worker to Telegram via tunnel**

Either re-deploy (`npm run deploy`) and re-register the webhook to point at the production URL, or run a tunnel (`cloudflared tunnel --url http://localhost:8787`) and re-register the webhook to point at the tunnel URL.

- [ ] **Step 3: Exercise the flow in a Telegram group**

In a chat with the bot:

1. `/start` → bot replies with **one** message: a board image (white at the bottom, full piece set visible) and caption `"New game. White to move."`. No `<pre>` text reply, no `.svg` document attachment.
2. `/move e2 e4` → board image flipped (black at the bottom, files h..a from left to right), caption `"e2-e4. Black to move."`.
3. `/move e7 e5` → board flipped back to white perspective, caption `"e7-e5. White to move."`.
4. `/move z9 e4` → text reply `Invalid move: …`, no image.
5. `/move e4 e6` (illegal) → text reply `Invalid move: …`, no image.
6. `/move` (no args) → usage hint, no image.
7. `/foo` → usage hint, no image.

If any of these fail, fix the bot before considering Task 4 done. Otherwise:

- [ ] **Step 4: Tail logs while you play to confirm no errors**

```bash
npx wrangler tail
```

Expected: log lines for each request, no exceptions.

- [ ] **Step 5: Commit any tweaks discovered**

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

Expected after Task 3: 11 tests pass (7 game + 4 dynboard).
