import chess

from dmchess import game


def test_new_game_has_standard_starting_position():
    board = game.new_game()
    assert board.fen() == chess.STARTING_FEN


def test_new_game_turn_is_white():
    board = game.new_game()
    assert game.turn(board) == "white"
