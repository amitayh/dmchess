# Inline PNG via chess.com `dynboard`

## Goal

Replace the current two-message reply (Unicode `<pre>` block + SVG document attachment) with a single Telegram message containing an inline PNG of the board, matching how the original Python version delivered moves. The Unicode renderer doesn't align well in Telegram clients, and SVG documents don't render inline — so the user sees no board at all without downloading the file.

## Approach

Outsource rendering to chess.com's existing public board-image endpoint:

```
https://www.chess.com/dynboard?fen=<fen>&board=brown&piece=neo&size=2&color=<perspective>
```

Pass the URL to grammY's `replyWithPhoto`. Telegram fetches the URL once, caches it on its CDN by URL hash, and serves it inline to all chat members.

**Why this and not on-Worker rasterization:**

- This is a hobby bot for two players, not production infrastructure.
- The endpoint returns a 480×480 PNG with the standard `neo` piece set, no watermark or branding, with a 1-week `Cache-Control` header.
- Verified by `curl`: returns 200 `image/png` for any FEN; ignores all attempted last-move query parameters (`lastMove`, `arrows`, `highlight`, `lm`, `from`/`to` — all return the identical post-move image).
- A self-hosted rasterizer (`@resvg/resvg-wasm` + vendored vector pieces) is the principled alternative but adds ~500 KB compressed to the Worker bundle (the free plan caps at 1 MB), several hundred lines of code, and a WASM init cost on cold start. Not worth it for this use case.

**Acknowledged risks:**

- The `dynboard` endpoint isn't an officially documented public API. chess.com could change the URL scheme or remove it without notice. If that happens, swap in the WASM approach in a follow-up.
- Every game position is sent to chess.com via the URL. Acceptable for a personal bot; would not be acceptable for a privacy-sensitive service.

## Compensating for the missing last-move highlight

The board image can't show the last move visually. The bot caption mentions it instead:

- `/start` reply caption: `"New game. White to move."`
- Move reply caption: `` `${from}-${to}. ${Capitalized(turn)} to move.` ``  
  e.g. `"e2-e4. Black to move."`, `"e7-e8q. White to move."` (promotion shown as the trailing UCI char).

`from` and `to` are extracted from the UCI move string returned by `applyMove` (`move.slice(0, 2)`, `move.slice(2)`).

## Files

### `src/rendering/dynboard.ts` — new

Pure URL builder. No I/O.

```ts
export function dynboardUrl(fen: string, perspective: "white" | "black"): string {
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

`URLSearchParams` handles FEN encoding (the spaces and slashes in a FEN come out correct as query-string values).

### `src/bot.ts` — modify

- Drop imports: `InputFile`, `renderUnicode`, `renderSvg`.
- Add import: `dynboardUrl` from `./rendering/dynboard`.
- Replace the two-step `sendBoard` (text reply + document reply) with a single `ctx.replyWithPhoto(url, { caption })`.
- Update call sites to pass the new caption strings.

The `Env`, `SessionData`, command-registration scaffolding, and the catch-all `/<unknown>` handler remain unchanged.

### Deletions

- `src/rendering/svg.ts`
- `src/rendering/unicode.ts`
- `test/svg.test.ts`
- `test/unicode.test.ts`

The `chess.js` dependency stays — `src/game.ts` still uses it. The Unicode and SVG renderers were the only consumers of those two modules.

### `test/dynboard.test.ts` — new

Unit tests for `dynboardUrl`:

- Starts with `https://www.chess.com/dynboard?`.
- FEN round-trips correctly: parsing the URL with `URL` and reading `fen` from `searchParams` returns the original FEN string. (`URLSearchParams` encodes spaces as `+` and slashes as `%2F`; the chess.com endpoint accepts this — verified by `curl`.)
- `color=white` for `perspective: "white"`, `color=black` for `perspective: "black"`.
- Includes `board=brown`, `piece=neo`, `size=2`.

No integration test against the live endpoint — that introduces flakiness and isn't necessary for a URL-builder unit test. The endpoint was verified manually before adopting it.

## Error handling

No new error paths. If chess.com is down or returns a non-2xx, Telegram's image fetch fails and the user sees an error in their chat ("Bad Request: failed to get HTTP URL content" or similar). grammY's default error handler logs the failure; Telegram retries the original update, which usually succeeds the second time. We don't try to handle this in code — for a toy bot, surfacing the failure to the user and relying on retry is fine.

## Out of scope

- Visual highlighting of the last move on the board image.
- Theme customization (board/piece set is hard-coded to `brown`/`neo`).
- Caching layer in the Worker — Telegram's CDN already caches by URL.
- Falling back to a self-hosted rasterizer if `dynboard` breaks. If/when that happens, that's a separate spec.
