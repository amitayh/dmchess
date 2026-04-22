import { Bot, session, type Context, type SessionFlavor } from "grammy";
import { KvAdapter } from "@grammyjs/storage-cloudflare";
import { applyMove, newGame, type Color, type Outcome } from "./game";
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

const USAGE =
  "Send a move as 'e2 e4' or 'e2e4'. Commands: /start to begin a new game, /move <from> <to>.";

export const MOVE_TEXT_REGEX = /^([a-h][1-8])\s?([a-h][1-8])$/i;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
      return outcome.winner;
    case "stalemate":
    case "insufficient-material":
    case "draw":
      return "white";
  }
}

async function sendBoard(
  ctx: BotContext,
  fen: string,
  perspective: Color,
  caption: string,
): Promise<void> {
  await ctx.replyWithPhoto(dynboardUrl(fen, perspective), { caption });
}

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
  ctx.session.fen = result.outcome.kind === "ongoing" ? result.fen : "";
  await sendBoard(ctx, result.fen, perspective, caption);
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
    const [from, to] = args as [string, string];
    await applyMoveAndReply(ctx, from, to);
  });

  // Prefixless moves: "e2e4" or "e2 e4". Registered BEFORE the catch-all so
  // matching text is handled here; unmatched text falls through.
  bot.hears(MOVE_TEXT_REGEX, async (ctx) => {
    const [, from, to] = ctx.match as unknown as [string, string, string];
    await applyMoveAndReply(ctx, from.toLowerCase(), to.toLowerCase());
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
