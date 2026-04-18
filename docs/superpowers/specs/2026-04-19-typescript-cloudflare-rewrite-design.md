# Chess Telegram Bot — TypeScript / Cloudflare Workers Rewrite — Design

**Date:** 2026-04-19

## Goal

Port the existing Python bot to TypeScript and host it on Cloudflare Workers. Persist game state in Workers KV so games survive Worker redeploys. Preserve the same user-facing functionality: `/start` and `/move` in a group chat, one game per chat, flipped board perspective for the player about to move.

The primary visual changes from v1 (Python) to this rewrite:

- The board is delivered as a **Unicode text board** in the message body (visible inline) **plus an SVG attachment** sent as a Telegram document (downloadable for higher fidelity). PNG rasterization is intentionally deferred — Workers has no native graphics libs, and a WASM rasterizer adds bundle size and complexity that aren't justified for v1.

## Scope

### In scope

- Rewrite the bot in TypeScript targeting Cloudflare Workers.
- Replace the existing Python codebase entirely (`src/dmchess/`, `tests/`, `pyproject.toml`, `.venv`, `.pytest_cache`). The Python version remains in git history.
- Telegram webhook delivery (Workers can't long-poll).
- Workers KV for game state, keyed by Telegram `chat_id`. Value is the FEN string.
- `/start` — begin a new game in this chat. If a game exists, it is overwritten.
- `/move <from> <to>` — apply the move, switch turns, reply with the new board.
- Reply per move/start: a `sendMessage` containing the Unicode board + a status caption, plus a `sendDocument` containing the SVG board, oriented for whoever moves next.
- Webhook secret verification via the `X-Telegram-Bot-Api-Secret-Token` header.

### Out of scope

- PNG rendering. (Unicode + SVG document is the v1 bar.)
- Move validation beyond what `chess.js` rejects — we surface its errors.
- Special-move UX (castling notation, en passant, promotion prompts). UCI squares only.
- Check / checkmate / stalemate detection and end-of-game handling.
- Resign, draw offers, undo, move history, PGN export.
- Per-player private boards.
- Per-player color binding. Any chat member can submit the next move; players are trusted to alternate.
- Game TTL or cleanup. KV entries persist indefinitely; `/start` overwrites.
- Authorization beyond Telegram's webhook secret.
- Automated webhook registration. README documents the one-time `curl` to Bot API.

## Architecture

A single Cloudflare Worker. The Worker's `fetch` handler verifies the Telegram secret header and delegates to grammY's `webhookCallback`. grammY routes commands, manages a KV-backed session keyed by `chat.id`, and replies via the Bot API.

```
Telegram ──webhook──▶ Worker (fetch handler)
                        │  verify secret header
                        ▼
                     grammY Bot
                        │
                        ├─▶ game.ts        (chess.js, pure FEN ops)
                        ├─▶ rendering/     (unicode + svg)
                        ├─▶ session: KV    (key=chat.id, value={ fen })
                        └─▶ ctx.reply / ctx.replyWithDocument
```

### Directory layout

```
dmchess/
  package.json
  tsconfig.json
  wrangler.toml
  README.md
  src/
    index.ts            # Worker fetch handler: secret verification + webhookCallback
    bot.ts              # grammY Bot, command handlers, session middleware wiring
    game.ts             # Pure FEN ops over chess.js
    rendering/
      unicode.ts        # renderUnicode(fen, perspective): string
      svg.ts            # renderSvg(fen, perspective, lastMove?): string
  test/
    game.test.ts
    unicode.test.ts
    svg.test.ts
```

### `game.ts` — chess state

Stateless functions over **FEN strings**. The KV value and the function I/O are both FEN, so no marshalling layer is needed.

- `newGame(): string` — returns the standard starting FEN.
- `turn(fen: string): "white" | "black"` — whose turn it is.
- `applyMove(fen: string, from: string, to: string): { fen: string; move: string; turn: "white" | "black" }` — loads FEN into a `Chess` instance, calls `chess.move({ from, to })`, returns the new FEN, the move as a **UCI string** (e.g. `"e2e4"`, suitable for the SVG renderer's `lastMove` parameter), and the next player's turn. Throws if the move is invalid or illegal.

### `rendering/unicode.ts`

- `renderUnicode(fen: string, perspective: "white" | "black"): string` — returns an 8-row text representation using Unicode chess piece glyphs (♔♕♖♗♘♙ / ♚♛♜♝♞♟). Rows are reversed for black perspective. Output fits in a Telegram message and renders inline.

### `rendering/svg.ts`

- `renderSvg(fen: string, perspective: "white" | "black", lastMove?: string): string` — returns an SVG document string. Draws an 8×8 grid of light/dark squares with Unicode glyphs in `<text>` elements. If `lastMove` is provided (UCI like `"e2e4"`), the from/to squares are highlighted. Hand-written; no rendering dependency.

### `bot.ts` — grammY wiring

- Builds the `Bot` with `TELEGRAM_BOT_TOKEN`.
- Installs `session({ initial: () => ({ fen: "" }), storage: new CloudflareAdapter(env.GAMES) })` from `@grammyjs/storage-cloudflare`.
- `bot.command("start", handler)` — sets `ctx.session.fen = newGame()`, sends Unicode reply, sends SVG document.
- `bot.command("move", handler)` — parses two args, loads `ctx.session.fen`, calls `applyMove`, updates session, replies. Handles missing game and invalid move with friendly replies.
- Catch-all command handler for unknown commands replies with a usage hint.

### `index.ts` — Worker entry

```ts
export default {
  async fetch(req, env, ctx) {
    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const bot = createBot(env);
    return webhookCallback(bot, "cloudflare-mod")(req);
  },
};
```

### Dependencies

- `grammy` — Telegram bot framework with first-class Workers support.
- `@grammyjs/storage-cloudflare` — KV-backed session storage adapter.
- `chess.js` — chess game logic, pure ESM, zero deps.
- Dev: `typescript`, `wrangler`, `vitest`, `@cloudflare/workers-types`.

## Configuration

### `wrangler.toml`

- `main = "src/index.ts"`
- `compatibility_date` set to a recent date.
- `compatibility_flags = ["nodejs_compat"]` (required by grammY).
- `kv_namespaces = [{ binding = "GAMES", id = "<created via wrangler>" }]`

### Secrets (via `wrangler secret put`)

- `TELEGRAM_BOT_TOKEN` — from BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — random opaque string used to verify webhook authenticity.

### Webhook registration (one-time, manual)

```
curl -F "url=https://<worker>.workers.dev/" \
     -F "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

Documented in README. No automated setup script in v1.

## Data flow — `/move e2 e4` in chat `12345`

1. Telegram POSTs the update to the Worker.
2. Worker checks `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET`. On mismatch, returns `401`.
3. `webhookCallback` parses the update, grammY's session middleware reads `game:12345` from KV.
4. `bot.command("move")` handler runs:
   1. Parse args. If not exactly two, reply usage hint and return.
   2. If `ctx.session.fen` is empty, reply `"No game in progress. Use /start."` and return.
   3. Call `applyMove(ctx.session.fen, "e2", "e4")`. On throw, reply `"Invalid move: <message>"` and return without updating session.
   4. Set `ctx.session.fen = result.fen`.
   5. Send Unicode board: `ctx.reply(renderUnicode(result.fen, result.turn) + "\n" + capitalize(result.turn) + " to move.")`.
   6. Send SVG document: `ctx.replyWithDocument(new InputFile(Buffer.from(renderSvg(result.fen, result.turn, result.move)), "board.svg"))`.
5. grammY's session middleware writes the updated session back to KV.
6. Worker returns `200 OK`.

`/start` is the same shape: step 4 sets `ctx.session.fen = newGame()`, perspective is `"white"`, no `lastMove`, and the caption is `"New game. White to move."`.

## Error handling

Only at boundaries — internal code trusts its callers.

- **Bad webhook secret** → `401`. Body is not parsed.
- **Bad `/move` arg format** → reply usage hint.
- **No game in chat** → reply `"No game in progress. Use /start."`.
- **`chess.js` rejects the move** → handler catches the exception and replies `"Invalid move: <message>"`. Session is not updated.
- **Unknown command** → reply usage hint.
- **KV / Telegram fetch failure** → propagate. Worker returns `500`. Telegram retries the webhook automatically.

## Testing

- **`vitest`** in plain Node env. No Workers pool needed for v1 — handlers are thin glue over pure functions.
- **`game.test.ts`** — port the seven existing Python tests:
  1. `newGame()` returns the standard starting FEN.
  2. `turn(newGame())` is `"white"`.
  3. `applyMove` from the start returns a move and a new FEN with the e-pawn moved to e4.
  4. `turn` flips after a move.
  5. `applyMove` throws on invalid UCI.
  6. `applyMove` throws on an illegal move (e.g. `e2 e5`).
  7. `applyMove` does not return a partially mutated FEN on rejection.
- **`unicode.test.ts`** — for the starting position: output has eight rows; row 8 contains the expected back-rank glyphs; row 1 contains the white back rank; black perspective produces a different string.
- **`svg.test.ts`** — output starts with `<svg`; contains `<text>` elements for known piece positions; differs between perspectives.
- **No handler-level tests in v1.** End-to-end verification is playing a game in Telegram against a deployed Worker.

## Design choices (and alternatives considered)

- **Unicode text + SVG document, not PNG.** Workers has no native graphics. A WASM rasterizer (e.g. `@resvg/resvg-wasm`) is the right path if PNGs are needed later, but adds ~1 MB to the bundle and a custom SVG generator. Unicode is universally rendered inline; SVG-as-document gives a high-fidelity option for users who want it. Easy to layer PNG on later without changing the rest of the architecture.
- **grammY, not raw `fetch`.** For two commands the difference is modest, but grammY's command routing, webhook adapter for Workers, and KV session middleware (`@grammyjs/storage-cloudflare`) eliminate a meaningful chunk of glue code. Adds one dependency.
- **Workers KV, not Durable Objects.** KV is eventually consistent. The race (two `/move`s arriving concurrently) is theoretical: chess naturally serializes by turn, players type seconds apart, and an illegal/out-of-turn move from a stale read would be rejected by `chess.js` anyway. KV is simpler, cheaper, and has no class/binding boilerplate. Switch to DO later if races become real.
- **Replace Python entirely.** The Python version is preserved in git history. A single-language repo is cleaner to deploy and maintain than a polyglot one.
- **FEN as the persistence + interface unit.** Both KV and the `game.ts` API speak FEN. No marshalling, no separate "domain object." Trivially testable.
- **Webhook secret in a header, not a path.** Telegram supports both. Header-based avoids the secret leaking into request logs / URL inspection tools.
- **No automated webhook registration.** A one-time `curl` is documented in the README. Adding a `wrangler` script would save one operation that happens once per deployment target.

## Manual verification

1. `wrangler kv namespace create GAMES` and paste the id into `wrangler.toml`.
2. `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put TELEGRAM_WEBHOOK_SECRET`.
3. `wrangler deploy`.
4. Register the webhook (`curl` per README).
5. Add the bot to a Telegram group containing yourself + a test account.
6. `/start` → confirm Unicode board appears with white on the bottom and the SVG attachment renders correctly.
7. `/move e2 e4` → confirm board re-renders flipped (black on bottom), caption says *"Black to move."*, SVG attachment matches.
8. Play several moves to confirm turns alternate and KV persists state across requests.
9. Try `/move` with bad args and with no game started — confirm friendly replies.
10. Restart conceptually doesn't apply (no process), but trigger a worker redeploy and confirm the in-progress game is recoverable from KV.
