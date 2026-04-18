import chess
import chess.svg
import cairosvg


_ORIENTATIONS = {
    "white": chess.WHITE,
    "black": chess.BLACK,
}


def render(
    board: chess.Board,
    perspective: str,
    lastmove: chess.Move | None = None,
) -> bytes:
    orientation = _ORIENTATIONS[perspective]
    svg = chess.svg.board(
        board,
        orientation=orientation,
        lastmove=lastmove,
        size=400,
    )
    return cairosvg.svg2png(bytestring=svg.encode("utf-8"))
