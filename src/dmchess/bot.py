import logging

import chess
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from . import game, rendering

logger = logging.getLogger(__name__)

games: dict[int, chess.Board] = {}

_USAGE = "Commands: /start to begin a new game, /move <from> <to> (e.g. /move e2 e4)."


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    board = game.new_game()
    games[chat_id] = board
    png = rendering.render(board, perspective="white")
    await context.bot.send_photo(
        chat_id=chat_id,
        photo=png,
        caption="New game. White to move.",
    )


async def move_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id

    if len(context.args) != 2:
        await update.message.reply_text(
            "Usage: /move <from> <to> — e.g. /move e2 e4"
        )
        return

    board = games.get(chat_id)
    if board is None:
        await update.message.reply_text("No game in progress. Use /start.")
        return

    from_sq, to_sq = context.args
    try:
        move = game.apply_move(board, from_sq, to_sq)
    except ValueError as exc:
        await update.message.reply_text(f"Invalid move: {exc}")
        return

    perspective = game.turn(board)
    png = rendering.render(board, perspective=perspective, lastmove=move)
    await context.bot.send_photo(
        chat_id=chat_id,
        photo=png,
        caption=f"{perspective.capitalize()} to move.",
    )


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(_USAGE)


def build_application(token: str) -> Application:
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("move", move_command))
    app.add_handler(MessageHandler(filters.COMMAND, unknown_command))
    return app
