# Chess Telegram Bot — TypeScript / Cloudflare Workers Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Python bot with a TypeScript implementation that runs on Cloudflare Workers, persists game state in KV, and replies with a Unicode board (text) plus an SVG board (document).

**Architecture:** Single Cloudflare Worker. The `fetch` handler verifies a Telegram secret header and delegates to grammY's `webhookCallback`. grammY routes commands, manages a KV-backed session per chat (`{ fen: string }`), and replies via the Bot API. Pure modules: `game.ts` (FEN ops over `chess.js`), `rendering/unicode.ts`, `rendering/svg.ts`. No PNG rasterization in v1.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, `grammy`, `@grammyjs/storage-cloudflare`, `chess.js`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-04-19-typescript-cloudflare-rewrite-design.md`

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | Node/TS dependencies, scripts |
| `tsconfig.json` | TypeScript compiler options |
| `wrangler.toml` | Worker config: entry, KV binding, compat flags |
| `.gitignore` | Ignore node_modules, build output, secrets |
| `.dev.vars.example` | Template for local dev secrets |
| `README.md` | Setup, deploy, webhook registration, play |
| `src/index.ts` | Worker `fetch` handler: secret verification + `webhookCallback` |
| `src/bot.ts` | grammY Bot, session middleware, command handlers |
| `src/game.ts` | Pure FEN ops over `chess.js`: `newGame`, `turn`, `applyMove` |
| `src/rendering/unicode.ts` | `renderUnicode(fen, perspective): string` |
| `src/rendering/svg.ts` | `renderSvg(fen, perspective, lastMove?): string` |
| `test/game.test.ts` | Pure-logic tests for `game.ts` |
| `test/unicode.test.ts` | Unicode-rendering tests |
| `test/svg.test.ts` | SVG-rendering tests |

**Files removed:** `src/dmchess/` (all `.py`), `src/dmchess.egg-info/`, `tests/` (all `.py`), `pyproject.toml`, `.env`, `.env.example`, `.venv/`, `.pytest_cache/`. The Python implementation is preserved in git history.

---

## Prerequisites (one-time, before Task 1)

- Node.js ≥ 20 (`node --version`).
- A Cloudflare account.
- A Telegram bot token from [@BotFather](https://t.me/BotFather) (you can reuse the existing one from the Python version's `.env`).
- Wrangler authenticated with Cloudflare:

```bash
npx wrangler login
```

Expected: opens a browser to authorize. Subsequent `wrangler` commands work without re-auth.

---

## Task 1: Tear down Python project and scaffold TypeScript project

**Files:**
- Delete: `src/dmchess/`, `src/dmchess.egg-info/`, `tests/`, `pyproject.toml`, `.env`, `.env.example`, `.venv/`, `.pytest_cache/`
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `.gitignore`, `.dev.vars.example`

- [ ] **Step 1: Remove the Python project files**

```bash
rm -rf src/dmchess src/dmchess.egg-info tests pyproject.toml .env .env.example .venv .pytest_cache
```

Verify:

```bash
ls -la
```

Expected: `src/`, `docs/`, `.git/`, `README.md` (still old), `.gitignore` (still old), `.claude/` remain. No Python artifacts.

- [ ] **Step 2: Replace `.gitignore` with Node-appropriate version**

Overwrite `.gitignore`:

```
node_modules/
dist/
.wrangler/
.dev.vars
*.log
.DS_Store
```

- [ ] **Step 3: Create `.dev.vars.example`**

Create `.dev.vars.example`:

```
TELEGRAM_BOT_TOKEN=your-bot-token-from-BotFather
TELEGRAM_WEBHOOK_SECRET=any-random-opaque-string
```

- [ ] **Step 4: Create `package.json`**

Create `package.json`:

```json
{
  "name": "dmchess",
  "version": "0.2.0",
  "description": "A Telegram bot for playing chess with a friend, on Cloudflare Workers.",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@grammyjs/storage-cloudflare": "^2.4.1",
    "chess.js": "^1.0.0",
    "grammy": "^1.30.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 5: Create `tsconfig.json`**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 6: Create `wrangler.toml`**

Create `wrangler.toml`:

```toml
name = "dmchess"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

# Replace `id` with the value printed by `wrangler kv namespace create GAMES` (run in Task 8).
[[kv_namespaces]]
binding = "GAMES"
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

Expected: creates `node_modules/` and `package-lock.json`. No errors.

- [ ] **Step 8: Verify TypeScript compiles an empty project**

Create a stub `src/index.ts`:

```ts
export default {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
} satisfies ExportedHandler;
```

Run:

```bash
npm run typecheck
```

Expected: exits 0 with no output (or only informational output).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: replace Python project with TypeScript scaffolding"
```

---

## Task 2: `game.ts` — `newGame` and `turn`

**Files:**
- Create: `src/game.ts`
- Create: `test/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/game.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { newGame, turn } from "../src/game";

const STARTING_FEN = new Chess().fen();

describe("game", () => {
  it("newGame returns the standard starting FEN", () => {
    expect(newGame()).toBe(STARTING_FEN);
  });

  it("turn of newGame is white", () => {
    expect(turn(newGame())).toBe("white");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/game'` or similar.

- [ ] **Step 3: Implement `newGame` and `turn`**

Create `src/game.ts`:

```ts
import { Chess } from "chess.js";

export type Color = "white" | "black";

export function newGame(): string {
  return new Chess().fen();
}

export function turn(fen: string): Color {
  return new Chess(fen).turn() === "w" ? "white" : "black";
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts test/game.test.ts
git commit -m "feat(game): add newGame and turn"
```

---

## Task 3: `game.ts` — `applyMove`

**Files:**
- Modify: `src/game.ts`
- Modify: `test/game.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `test/game.test.ts` inside the existing `describe` block (before its closing `});`):

```ts
  it("applyMove returns new FEN, UCI move, and next turn", () => {
    const result = applyMove(newGame(), "e2", "e4");
    expect(result.move).toBe("e2e4");
    expect(result.turn).toBe("black");
    // After 1.e4, the e-pawn is on e4 and e2 is empty.
    expect(result.fen).toContain("4P3"); // rank 4 has pawn on e-file
    expect(result.fen).not.toBe(newGame());
  });

  it("turn flips after a move", () => {
    const { fen } = applyMove(newGame(), "e2", "e4");
    expect(turn(fen)).toBe("black");
  });

  it("applyMove throws on invalid square notation", () => {
    expect(() => applyMove(newGame(), "zz", "xx")).toThrow();
  });

  it("applyMove throws on illegal move", () => {
    expect(() => applyMove(newGame(), "e2", "e5")).toThrow();
  });

  it("applyMove does not return the input FEN on illegal move", () => {
    const start = newGame();
    expect(() => applyMove(start, "e2", "e5")).toThrow();
    // Calling newGame() again still produces the standard starting FEN —
    // applyMove is pure, it cannot have mutated anything.
    expect(newGame()).toBe(start);
  });
```

Add `applyMove` to the import at the top:

```ts
import { newGame, turn, applyMove } from "../src/game";
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: 5 new tests fail (`applyMove is not a function` or similar).

- [ ] **Step 3: Implement `applyMove`**

Append to `src/game.ts`:

```ts
export interface MoveResult {
  fen: string;
  move: string; // UCI like "e2e4" or "e7e8q"
  turn: Color;
}

export function applyMove(fen: string, from: string, to: string): MoveResult {
  const chess = new Chess(fen);
  // chess.js v1.x throws on illegal moves and rejects bad squares.
  const move = chess.move({ from, to, promotion: "q" });
  return {
    fen: chess.fen(),
    move: `${move.from}${move.to}${move.promotion ?? ""}`,
    turn: chess.turn() === "w" ? "white" : "black",
  };
}
```

Notes:
- `chess.js` v1 throws on illegal/invalid moves, so we don't need a `null` check.
- `promotion: "q"` auto-promotes pawn moves to a queen. Promotion UX is out of scope for v1.
- The function is pure: it constructs a new `Chess` per call. The caller's FEN string is never mutated.

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts test/game.test.ts
git commit -m "feat(game): add applyMove"
```

---

## Task 4: `rendering/unicode.ts`

**Files:**
- Create: `src/rendering/unicode.ts`
- Create: `test/unicode.test.ts`

The Unicode renderer prints an 8-row board with rank labels on the left and file labels on the bottom. White perspective: rank 8 on top, files a-h. Black perspective: rank 1 on top, files h-a.

Format example (white perspective, starting position):

```
8 ♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜
7 ♟ ♟ ♟ ♟ ♟ ♟ ♟ ♟
6 . . . . . . . .
5 . . . . . . . .
4 . . . . . . . .
3 . . . . . . . .
2 ♙ ♙ ♙ ♙ ♙ ♙ ♙ ♙
1 ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖
  a b c d e f g h
```

- [ ] **Step 1: Write the failing tests**

Create `test/unicode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newGame, applyMove } from "../src/game";
import { renderUnicode } from "../src/rendering/unicode";

describe("renderUnicode", () => {
  it("white perspective shows rank 8 first and rank 1 last", () => {
    const out = renderUnicode(newGame(), "white");
    const lines = out.trimEnd().split("\n");
    // 8 board rows + 1 file label row
    expect(lines).toHaveLength(9);
    expect(lines[0]?.startsWith("8")).toBe(true);
    expect(lines[7]?.startsWith("1")).toBe(true);
    expect(lines[8]).toContain("a");
    expect(lines[8]).toContain("h");
  });

  it("white perspective contains the white back-rank glyphs", () => {
    const out = renderUnicode(newGame(), "white");
    // White king ♔ and queen ♕ on rank 1
    expect(out).toContain("♔");
    expect(out).toContain("♕");
    // Black king ♚ and queen ♛ on rank 8
    expect(out).toContain("♚");
    expect(out).toContain("♛");
  });

  it("black perspective shows rank 1 first and reverses files", () => {
    const out = renderUnicode(newGame(), "black");
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(9);
    expect(lines[0]?.startsWith("1")).toBe(true);
    expect(lines[7]?.startsWith("8")).toBe(true);
    // File labels should be reversed: h first, a last
    expect(lines[8]?.indexOf("h")).toBeLessThan(lines[8]!.indexOf("a"));
  });

  it("renders empty squares as a dot", () => {
    const out = renderUnicode(newGame(), "white");
    expect(out).toContain(".");
  });

  it("after 1.e4, e2 is empty and e4 has a white pawn", () => {
    const { fen } = applyMove(newGame(), "e2", "e4");
    const out = renderUnicode(fen, "black");
    const lines = out.trimEnd().split("\n");
    // Black perspective: rank 4 is at index 4 from the top (1=0, 2=1, 3=2, 4=3).
    // Files are h..a, so e is index 3 from the right == index 4 from the left.
    // Just check the white pawn glyph appears in some rank-4 row.
    const rank4Line = lines.find((l) => l.startsWith("4"));
    expect(rank4Line).toContain("♙");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: 5 unicode tests fail with `Cannot find module '../src/rendering/unicode'`.

- [ ] **Step 3: Implement `renderUnicode`**

Create `src/rendering/unicode.ts`:

```ts
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: 12 passed (7 game + 5 unicode).

- [ ] **Step 5: Commit**

```bash
git add src/rendering/unicode.ts test/unicode.test.ts
git commit -m "feat(rendering): add Unicode board renderer"
```

---

## Task 5: `rendering/svg.ts`

**Files:**
- Create: `src/rendering/svg.ts`
- Create: `test/svg.test.ts`

A minimal hand-written SVG: 8×8 grid of light/dark squares with Unicode glyphs in `<text>` elements. Optional `lastMove` (UCI like `"e2e4"`) highlights the from and to squares.

- [ ] **Step 1: Write the failing tests**

Create `test/svg.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newGame, applyMove } from "../src/game";
import { renderSvg } from "../src/rendering/svg";

describe("renderSvg", () => {
  it("starts with an <svg> element", () => {
    expect(renderSvg(newGame(), "white").trimStart().startsWith("<svg")).toBe(true);
  });

  it("contains 64 square rects", () => {
    const svg = renderSvg(newGame(), "white");
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    // 64 squares + possibly 2 highlight rects when lastMove present;
    // here lastMove is undefined, so exactly 64.
    expect(rectCount).toBe(64);
  });

  it("contains piece glyphs for the starting position", () => {
    const svg = renderSvg(newGame(), "white");
    expect(svg).toContain("♔"); // white king
    expect(svg).toContain("♚"); // black king
  });

  it("white and black perspectives produce different output", () => {
    expect(renderSvg(newGame(), "white")).not.toBe(renderSvg(newGame(), "black"));
  });

  it("highlights last-move squares when lastMove provided", () => {
    const { fen } = applyMove(newGame(), "e2", "e4");
    const withHighlight = renderSvg(fen, "black", "e2e4");
    const withoutHighlight = renderSvg(fen, "black");
    expect(withHighlight).not.toBe(withoutHighlight);
    // 64 base + 2 highlights
    const rectCount = (withHighlight.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(66);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: 5 svg tests fail with `Cannot find module '../src/rendering/svg'`.

- [ ] **Step 3: Implement `renderSvg`**

Create `src/rendering/svg.ts`:

```ts
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: 17 passed (7 game + 5 unicode + 5 svg).

- [ ] **Step 5: Commit**

```bash
git add src/rendering/svg.ts test/svg.test.ts
git commit -m "feat(rendering): add SVG board renderer"
```

---

## Task 6: `bot.ts` — grammY handlers and session

**Files:**
- Create: `src/bot.ts`

No unit tests — handlers are thin glue over already-tested pure functions. End-to-end verification in Task 9.

- [ ] **Step 1: Implement `bot.ts`**

Create `src/bot.ts`:

```ts
import { Bot, InputFile, session, type Context, type SessionFlavor } from "grammy";
import { KvAdapter } from "@grammyjs/storage-cloudflare";
import { applyMove, newGame } from "./game";
import { renderUnicode } from "./rendering/unicode";
import { renderSvg } from "./rendering/svg";

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
  perspective: "white" | "black",
  caption: string,
  lastMove?: string,
): Promise<void> {
  const text = `<pre>${renderUnicode(fen, perspective)}</pre>\n${caption}`;
  await ctx.reply(text, { parse_mode: "HTML" });
  const svg = renderSvg(fen, perspective, lastMove);
  await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(svg), "board.svg"));
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
    await sendBoard(ctx, result.fen, result.turn, `${capitalize(result.turn)} to move.`, result.move);
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

Notes:
- `ctx.match` for `bot.command("move")` is the text after `/move` (without the command itself), so `args.length` of 2 corresponds to `/move e2 e4`.
- Wrapping the Unicode board in `<pre>` with `parse_mode: "HTML"` makes Telegram render it monospace so columns align. Glyph alignment in monospace fonts varies by client, but it's the best we can do without a rasterizer.
- Sessions are persisted automatically by grammY's session middleware, keyed by `ctx.chat.id` by default.
- `InputFile` accepts a `Uint8Array` and a filename.

- [ ] **Step 2: Verify it typechecks**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): grammY handlers with KV-backed session"
```

---

## Task 7: `index.ts` — Worker entry point

**Files:**
- Modify: `src/index.ts` (replace the stub from Task 1)

- [ ] **Step 1: Replace `src/index.ts`**

Overwrite `src/index.ts`:

```ts
import { webhookCallback } from "grammy";
import { createBot, type Env } from "./bot";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("ok");
    }

    const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (provided !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    const bot = createBot(env);
    return webhookCallback(bot, "cloudflare-mod")(request);
  },
} satisfies ExportedHandler<Env>;
```

Notes:
- Non-POST requests get a generic `ok` reply so a browser visiting the URL doesn't surface a scary 405. Telegram only POSTs.
- The secret check comes before any body parsing.
- A new `Bot` is constructed per request — Workers are short-lived; there's no long-running process to reuse.

- [ ] **Step 2: Verify it typechecks**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: 17 passed.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: Worker entry point with secret verification"
```

---

## Task 8: Cloudflare resources and local dev verification

This task creates the KV namespace and verifies the Worker boots in `wrangler dev`.

- [ ] **Step 1: Create the KV namespace**

```bash
npx wrangler kv namespace create GAMES
```

Expected: prints something like

```
🌀 Creating namespace with title "dmchess-GAMES"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "GAMES"
id = "abc123def456..."
```

Copy the `id` value.

- [ ] **Step 2: Update `wrangler.toml` with the KV namespace id**

In `wrangler.toml`, replace `REPLACE_WITH_KV_NAMESPACE_ID` with the id from Step 1.

- [ ] **Step 3: Create `.dev.vars` with local secrets**

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in your real bot token from BotFather and a random secret string (any opaque string — pick something with `openssl rand -hex 32`):

```
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_WEBHOOK_SECRET=...random hex string...
```

`.dev.vars` is gitignored.

- [ ] **Step 4: Boot `wrangler dev` and confirm it starts**

```bash
npx wrangler dev
```

Expected: prints a local URL (e.g. `http://localhost:8787`) and "Ready on ...". Leave it running.

- [ ] **Step 5: Smoke-test the unauthorized path**

In a second terminal:

```bash
curl -X POST -H "X-Telegram-Bot-Api-Secret-Token: wrong" http://localhost:8787/
```

Expected: `unauthorized` (status 401).

- [ ] **Step 6: Smoke-test the authorized path with an empty body**

```bash
curl -X POST \
     -H "X-Telegram-Bot-Api-Secret-Token: $(grep TELEGRAM_WEBHOOK_SECRET .dev.vars | cut -d= -f2)" \
     -H "Content-Type: application/json" \
     -d '{}' \
     http://localhost:8787/
```

Expected: 200 with empty body (grammY accepts the request even though there's nothing to do). No 401, no crash in the dev terminal.

- [ ] **Step 7: Stop wrangler dev**

Ctrl-C in the dev terminal.

- [ ] **Step 8: Commit the wrangler.toml change**

```bash
git add wrangler.toml
git commit -m "chore: wire KV namespace id"
```

---

## Task 9: Deploy and end-to-end verification

- [ ] **Step 1: Push secrets to Cloudflare**

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
# paste token, press Enter
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# paste the same secret you used in .dev.vars (or generate a fresh one)
```

Expected: each command confirms the secret is uploaded.

- [ ] **Step 2: Deploy**

```bash
npx wrangler deploy
```

Expected: prints the deployed URL (e.g. `https://dmchess.<your-subdomain>.workers.dev`). Note this URL.

- [ ] **Step 3: Register the webhook with Telegram**

Replace `<TOKEN>`, `<URL>`, and `<SECRET>` below:

```bash
curl -F "url=<URL>" \
     -F "secret_token=<SECRET>" \
     "https://api.telegram.org/bot<TOKEN>/setWebhook"
```

Where `<URL>` is the deployed Worker URL from Step 2 and `<SECRET>` matches `TELEGRAM_WEBHOOK_SECRET`.

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`.

Verify:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Expected: shows `url` matching your Worker URL and `pending_update_count: 0`.

- [ ] **Step 4: Configure bot privacy for groups**

In Telegram, message [@BotFather](https://t.me/BotFather):

- `/setprivacy` → choose your bot → **Disable**.

Without this, the bot only sees commands explicitly mentioning it in groups, and `/move` will be ignored.

- [ ] **Step 5: Play through the verification checks**

In a Telegram group with the bot and a second account (or your test account in another client):

1. `/start` → bot replies with a Unicode board (white on bottom in the text), caption "New game. White to move." and an SVG document attachment.
2. `/move e2 e4` → bot replies with a new Unicode board oriented for black (rank 1 at top, files h..a), caption "Black to move.", and an SVG document with the e2-e4 squares highlighted.
3. `/move e7 e5` → bot replies with a board flipped back to white perspective, caption "White to move."
4. `/move` (no args) → bot replies with the usage hint.
5. `/move z9 e4` → bot replies with `Invalid move: ...`.
6. `/move e4 e6` (illegal: pawn can only advance one square after its opening move) → bot replies with `Invalid move: ...`.
7. `/foo` (unknown command) → bot replies with the usage hint.
8. In a fresh group (or after deleting the KV entry via `wrangler kv key delete --binding=GAMES <chat_id>`), `/move e2 e4` without `/start` → bot replies "No game in progress. Use /start."
9. `/start` mid-game → board resets to the starting position.
10. Trigger a redeploy (`npx wrangler deploy`) mid-game → next `/move` continues from the same board (proves KV persistence).

- [ ] **Step 6: Tail logs to confirm no errors**

```bash
npx wrangler tail
```

While tailing, send another `/move` from the chat. Expected: log lines for the request, no exceptions.

- [ ] **Step 7: Commit any tweaks discovered**

If the manual run revealed a bug or doc gap:

```bash
git status
git add <files>
git commit -m "fix: <what was wrong>"
```

---

## Task 10: Rewrite README for the new stack

**Files:**
- Modify: `README.md` (current contents are for the Python version)

- [ ] **Step 1: Overwrite `README.md`**

Overwrite `README.md`:

````markdown
# dmchess

A Telegram bot for playing chess with a friend in a group chat. Runs on Cloudflare Workers.

After each move, the bot replies with:
- a Unicode board in the message body (oriented for whoever moves next), and
- the same board as an SVG document attachment for higher fidelity.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Disable privacy mode so the bot sees `/move` in groups: message @BotFather, run `/setprivacy`, choose your bot, choose **Disable**.
3. Install dependencies and authenticate Wrangler:

   ```bash
   npm install
   npx wrangler login
   ```

4. Create a KV namespace and put its id in `wrangler.toml`:

   ```bash
   npx wrangler kv namespace create GAMES
   ```

5. Push the bot token and a webhook secret as Worker secrets:

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any opaque string; e.g. `openssl rand -hex 32`
   ```

## Deploy

```bash
npm run deploy
```

This prints a URL like `https://dmchess.<your-subdomain>.workers.dev`. Register it as the webhook (one-time):

```bash
curl -F "url=https://dmchess.<your-subdomain>.workers.dev/" \
     -F "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook"
```

Verify with:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Local dev

Copy `.dev.vars.example` to `.dev.vars` and fill it in, then:

```bash
npm run dev
```

This starts `wrangler dev` with a local KV. To exercise it against real Telegram, expose it via a tunnel (e.g. `cloudflared tunnel`) and re-register the webhook to point at the tunnel URL.

## Play

1. Add the bot to a Telegram group with one friend.
2. `/start` to begin a new game.
3. `/move e2 e4` to play a move. UCI squares only — no piece letters.
4. After each move, the bot re-posts the board oriented for the next player.

## Test

```bash
npm test
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for the TypeScript / Workers version"
```

---

## Running the full test suite

At any point:

```bash
npm test
```

Expected after Task 5: 17 passed total (7 game + 5 unicode + 5 svg).
