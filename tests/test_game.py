import pytest

import chess

from dmchess import game


def test_new_game_has_standard_starting_position():
    board = game.new_game()
    assert board.fen() == chess.STARTING_FEN


def test_new_game_turn_is_white():
    board = game.new_game()
    assert game.turn(board) == "white"


def test_apply_move_returns_move_and_updates_board():
    board = game.new_game()
    move = game.apply_move(board, "e2", "e4")
    assert move.uci() == "e2e4"
    assert board.piece_at(chess.E4).symbol() == "P"
    assert board.piece_at(chess.E2) is None


def test_turn_flips_after_move():
    board = game.new_game()
    game.apply_move(board, "e2", "e4")
    assert game.turn(board) == "black"


def test_apply_move_raises_on_invalid_uci():
    board = game.new_game()
    with pytest.raises(ValueError):
        game.apply_move(board, "zz", "xx")


def test_apply_move_raises_on_illegal_move():
    board = game.new_game()
    with pytest.raises(ValueError):
        game.apply_move(board, "e2", "e5")  # pawn cannot move 3 squares from start


def test_apply_move_does_not_partially_mutate_on_rejection():
    board = game.new_game()
    original_fen = board.fen()
    with pytest.raises(ValueError):
        game.apply_move(board, "e2", "e5")
    assert board.fen() == original_fen
