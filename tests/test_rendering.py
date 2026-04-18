from dmchess import game, rendering


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def test_render_new_game_returns_png_bytes():
    board = game.new_game()
    png = rendering.render(board, perspective="white")
    assert png.startswith(PNG_MAGIC)
    assert len(png) > 100


def test_render_black_perspective_returns_png_bytes():
    board = game.new_game()
    png = rendering.render(board, perspective="black")
    assert png.startswith(PNG_MAGIC)


def test_render_with_lastmove_returns_png_bytes():
    board = game.new_game()
    move = game.apply_move(board, "e2", "e4")
    png = rendering.render(board, perspective="black", lastmove=move)
    assert png.startswith(PNG_MAGIC)


def test_render_different_perspectives_produce_different_output():
    board = game.new_game()
    white_png = rendering.render(board, perspective="white")
    black_png = rendering.render(board, perspective="black")
    assert white_png != black_png
