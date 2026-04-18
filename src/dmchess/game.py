import chess


def new_game() -> chess.Board:
    return chess.Board()


def turn(board: chess.Board) -> str:
    return "white" if board.turn == chess.WHITE else "black"
