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
