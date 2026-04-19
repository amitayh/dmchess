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
