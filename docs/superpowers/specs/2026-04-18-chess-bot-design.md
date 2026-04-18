# Chess Telegram Bot — Design

**Date:** 2026-04-18

## Goal

A Telegram bot that lets two friends play chess together in a group chat. One shared board rendered as an image, flipped each turn so the player about to move sees their pieces on the bottom.

## Scope

### In scope (v1)

- Telegram group chat with the bot and two human players.
- `/start` — begin a new game in this chat. If a game is already in progress, it is discarded and replaced.
- `/move <from> <to>` — e.g. `/move e2 e4`. Applies the move, switches turns, renders and posts the new board.
- Board rendered as a PNG image, oriented from the perspective of whoever moves next.
- One active game per chat, keyed by Telegram `chat_id`.
- In-memory state. Games are lost when the bot process restarts.
- Local hosting (run on the developer's laptop).

### Out of scope (v1)

- Move validation beyond what `python-chess` rejects by default when we push a move (we surface its errors rather than pre-validate).
- Special-move UX (castling, en passant, promotion prompts). A player submits the UCI squares; if `python-chess` accepts it, it's applied.
- Check / checkmate / stalemate detection and end-of-game handling.
- Resign, draw offers, undo, move history, PGN export.
- Per-player private-message boards from each player's perspective.
- Persistence across bot restarts.
- Per-player color binding. Any member of the chat can submit the next move; friends are trusted to alternate.
- Cloud deployment, webhooks.

## Architecture

Three small modules plus an entry point. Each module has one clear job and a minimal interface.

```
dmchess/
  pyproject.toml
  .env.example           # TELEGRAM_BOT_TOKEN=...
  src/dmchess/
    __init__.py
    main.py              # env loading + Application wiring
    bot.py               # Telegram handlers + in-memory games dict
    game.py              # chess state wrapper
    rendering.py         # board -> PNG
  tests/
    test_game.py
    test_rendering.py
```

### `game.py` — chess state

Thin wrapper over `python-chess`. Stateless functions; the `chess.Board` is the state.

- `new_game() -> chess.Board`
- `apply_move(board, from_sq, to_sq) -> chess.Move` — calls `board.push(chess.Move.from_uci(from_sq + to_sq))`. Raises on invalid UCI (propagated up).
- `turn(board) -> "white" | "black"` — whose turn it is now.

### `rendering.py` — board to image

One function:

- `render(board, perspective, lastmove=None) -> bytes` — returns PNG bytes.
  - `perspective` is `"white"` or `"black"`; controls `chess.svg.board(..., orientation=...)`.
  - `lastmove` is highlighted when provided.
  - Uses `chess.svg.board(...)` to produce SVG, then `cairosvg.svg2png` to rasterize.

### `bot.py` — Telegram handlers

Uses `python-telegram-bot` (v21, async).

- Module-level `games: dict[int, chess.Board]` mapping `chat_id` → current board.
- Handlers:
  - `/start` — create a new game for this chat, overwrite any existing one. Render white-perspective board, post with caption *"New game. White to move."*
  - `/move` — parse args, look up the game, apply the move, render from the next player's perspective, post.
  - Unknown-command fallback — short usage reply.

### `main.py` — entry point

- Loads `TELEGRAM_BOT_TOKEN` from the environment (supports `.env` via `python-dotenv`, or just plain env vars).
- Builds the `Application`, registers handlers, starts long-polling (`application.run_polling()`).
- No webhook setup — long-polling keeps local development trivial.

### Dependencies

- `python-telegram-bot[ext] ~= 21`
- `python-chess`
- `cairosvg`
- `pillow` (transitive dependency of cairosvg)
- `python-dotenv` (required — loads `TELEGRAM_BOT_TOKEN` from `.env` at startup)

## Data flow — `/move e2 e4` in chat `12345`

1. Telegram delivers the update to the `/move` handler.
2. Handler parses args: `from_sq = "e2"`, `to_sq = "e4"`. If argument format is wrong, reply with a short usage message and stop.
3. Look up `games[12345]`. If missing, reply `"No game in progress. Use /start."` and stop.
4. `move = game.apply_move(board, from_sq, to_sq)`. If `python-chess` raises (invalid UCI, illegal move, bad square), catch and reply with the exception message. Do not partially apply state.
5. `perspective = game.turn(board)` — the side whose turn it is *after* the move.
6. `png = rendering.render(board, perspective=perspective, lastmove=move)`.
7. `await context.bot.send_photo(chat_id, png, caption=f"{perspective.capitalize()} to move.")`.

`/start` follows the same shape: step 4 becomes `games[chat_id] = game.new_game()`, perspective is always `"white"`, and there's no `lastmove`.

## Design choices (and alternatives considered)

- **Telegram, not WhatsApp.** WhatsApp Cloud API requires Meta Business verification, a dedicated phone number, and message templates — far too much for a two-person friend project. Telegram is a 30-second BotFather token.
- **Shared board in group, flipped per turn.** We considered private DMs to each player for true per-player perspective, but that requires each player to `/start` the bot in a private chat first. Shared-board-with-flip gives each player their own perspective just before they move.
- **No color binding.** Tracking which Telegram user is which color is easy but adds edge cases (who claims which color, what happens if a third party tries). Trusting friends to take turns is the simplest v1 that works.
- **Image rendering, not unicode.** `python-chess` ships SVG rendering; combined with `cairosvg` the image path is ~5 lines and looks dramatically better than monospace unicode in Telegram, which aligns poorly on mobile.
- **In-memory state.** Games are short enough that restart-loss is a minor inconvenience. No need for SQLite or files in v1.
- **Long-polling, not webhooks.** Webhooks need a public URL. Long-polling just needs an outbound internet connection, which is what we want for local dev.

## Error handling

Only at boundaries — internal code trusts its callers.

- **Bad `/move` arg format:** Reply with a usage hint. No crash.
- **No game in chat:** Prompt to `/start`. No crash.
- **`python-chess` rejects the move** (invalid UCI, illegal square, illegal move): Catch the exception in the handler and reply with its message verbatim. Keeps errors visible without custom formatting code.
- **Network / Telegram errors:** Let `python-telegram-bot`'s default error handler log and continue. No custom retries.

## Testing

- `test_game.py` — pure-logic tests for `new_game`, `apply_move`, `turn`. Fast, no I/O.
- `test_rendering.py` — `render()` returns non-empty PNG bytes for a few boards (check PNG magic-byte header; no pixel-level assertions).
- **No handler-level tests in v1.** Testing `python-telegram-bot` handlers requires mocking `Update` / `Context` and adds more scaffolding than the two-file handler module justifies. End-to-end verification is playing a game in a real chat.

## Manual verification

1. Create a bot via `@BotFather`, put the token in `.env`.
2. `python -m dmchess.main` locally.
3. Add the bot to a Telegram group containing yourself + a test account.
4. `/start` → confirm initial board renders, white on bottom.
5. `/move e2 e4` → confirm board re-renders flipped (black on bottom), caption says *"Black to move."*
6. Play a handful of moves to confirm turns alternate and the perspective flip is consistent.
7. Try `/move` with bad args and with no game started — confirm friendly replies.
