import chess


def new_game() -> chess.Board:
    return chess.Board()


def turn(board: chess.Board) -> str:
    return "white" if board.turn == chess.WHITE else "black"


def apply_move(board: chess.Board, from_sq: str, to_sq: str) -> chess.Move:
    return board.push_uci(from_sq + to_sq)
