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
