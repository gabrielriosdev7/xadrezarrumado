<?php

require_once __DIR__ . '/Board.php';
require_once __DIR__ . '/Piece.php';

/**
 * Gera movimentos legais e verifica ataques, xeque e fim de partida.
 */
class Rules
{
    public function getLegalMoves(Board $board, int $row, int $col): array
    {
        $piece = $board->getPieceAt($row, $col);
        if ($piece === null) {
            return [];
        }

        $moves = $piece->getPossibleMoves($board->getGrid(), $row, $col);
        if ($piece instanceof Pawn) {
            $moves = array_merge($moves, $this->getEnPassantMoves($board, $piece, $row, $col));
        } elseif ($piece instanceof King) {
            $moves = array_merge($moves, $this->getCastlingMoves($board, $piece, $row, $col));
        }

        return array_values(array_filter(
            $moves,
            fn(array $destination): bool => !$this->moveLeavesOwnKingInCheck(
                $board,
                $row,
                $col,
                $destination[0],
                $destination[1],
                $piece->getColor()
            )
        ));
    }

    private function getEnPassantMoves(Board $board, Pawn $pawn, int $row, int $col): array
    {
        $target = $board->getEnPassantTarget();
        if ($target === null || $target[0] !== $row + ($pawn->getColor() === 'white' ? -1 : 1)) {
            return [];
        }

        $lastMove = $board->getLastMove();
        if ($lastMove === null || $target[1] !== $lastMove['toCol'] || abs($target[1] - $col) !== 1) {
            return [];
        }

        return [$target];
    }

    private function getCastlingMoves(Board $board, King $king, int $row, int $col): array
    {
        $homeRow = $king->getColor() === 'white' ? 7 : 0;
        if ($row !== $homeRow || $col !== 4 || $king->hasMoved() || $this->isInCheck($board, $king->getColor())) {
            return [];
        }

        $moves = [];
        foreach ([
            ['rookCol' => 7, 'spaces' => [5, 6], 'through' => [5, 6], 'destination' => 6],
            ['rookCol' => 0, 'spaces' => [1, 2, 3], 'through' => [3, 2], 'destination' => 2],
        ] as $side) {
            $rook = $board->getPieceAt($homeRow, $side['rookCol']);
            if (
                !($rook instanceof Rook)
                || $rook->getColor() !== $king->getColor()
                || $rook->hasMoved()
            ) {
                continue;
            }

            $clear = true;
            foreach ($side['spaces'] as $spaceCol) {
                if ($board->getPieceAt($homeRow, $spaceCol) !== null) {
                    $clear = false;
                    break;
                }
            }
            if (!$clear) {
                continue;
            }

            foreach ($side['through'] as $throughCol) {
                $simulation = $board->clone();
                $simulation->movePiece($homeRow, 4, $homeRow, $throughCol);
                if ($this->isInCheck($simulation, $king->getColor())) {
                    $clear = false;
                    break;
                }
            }

            if ($clear) {
                $moves[] = [$homeRow, $side['destination']];
            }
        }

        return $moves;
    }

    private function moveLeavesOwnKingInCheck(
        Board $board,
        int $fromRow,
        int $fromCol,
        int $toRow,
        int $toCol,
        string $color
    ): bool {
        $simulation = $board->clone();
        $simulation->movePiece($fromRow, $fromCol, $toRow, $toCol);

        return $this->isInCheck($simulation, $color);
    }

    public function isInCheck(Board $board, string $color): bool
    {
        $king = $board->findKing($color);
        if ($king === null) {
            return false;
        }

        $enemyColor = $color === 'white' ? 'black' : 'white';
        return $this->isSquareAttacked($board, $king[0], $king[1], $enemyColor);
    }

    private function isSquareAttacked(Board $board, int $row, int $col, string $byColor): bool
    {
        $grid = $board->getGrid();
        $pawnDirection = $byColor === 'white' ? -1 : 1;
        $pawnRow = $row - $pawnDirection;
        foreach ([-1, 1] as $offset) {
            $pawnCol = $col + $offset;
            $piece = $board->getPieceAt($pawnRow, $pawnCol);
            if ($piece instanceof Pawn && $piece->getColor() === $byColor) {
                return true;
            }
        }

        foreach ([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as [$dRow, $dCol]) {
            $piece = $board->getPieceAt($row + $dRow, $col + $dCol);
            if ($piece instanceof Knight && $piece->getColor() === $byColor) {
                return true;
            }
        }

        foreach ([-1, 0, 1] as $dRow) {
            foreach ([-1, 0, 1] as $dCol) {
                if ($dRow === 0 && $dCol === 0) {
                    continue;
                }

                $piece = $board->getPieceAt($row + $dRow, $col + $dCol);
                if ($piece instanceof King && $piece->getColor() === $byColor) {
                    return true;
                }
            }
        }

        foreach ([
            [-1, 0, Rook::class], [1, 0, Rook::class], [0, -1, Rook::class], [0, 1, Rook::class],
            [-1, -1, Bishop::class], [-1, 1, Bishop::class], [1, -1, Bishop::class], [1, 1, Bishop::class],
        ] as [$dRow, $dCol, $slidingPiece]) {
            $scanRow = $row + $dRow;
            $scanCol = $col + $dCol;
            while ($board->isOnBoard($scanRow, $scanCol)) {
                $piece = $grid[$scanRow][$scanCol];
                if ($piece !== null) {
                    if ($piece->getColor() === $byColor
                        && ($piece instanceof Queen || $piece instanceof $slidingPiece)
                    ) {
                        return true;
                    }
                    break;
                }
                $scanRow += $dRow;
                $scanCol += $dCol;
            }
        }

        return false;
    }

    public function getAllLegalMoves(Board $board, string $color): array
    {
        $allMoves = [];
        $grid = $board->getGrid();

        for ($row = 0; $row < 8; $row++) {
            for ($col = 0; $col < 8; $col++) {
                $piece = $grid[$row][$col];
                if ($piece !== null && $piece->getColor() === $color) {
                    foreach ($this->getLegalMoves($board, $row, $col) as $destination) {
                        $allMoves[] = [
                            'from' => [$row, $col],
                            'to' => $destination,
                        ];
                    }
                }
            }
        }

        return $allMoves;
    }

    public function isCheckmate(Board $board, string $color): bool
    {
        return $this->isInCheck($board, $color)
            && empty($this->getAllLegalMoves($board, $color));
    }

    public function isStalemate(Board $board, string $color): bool
    {
        return !$this->isInCheck($board, $color)
            && empty($this->getAllLegalMoves($board, $color));
    }

    public function isInsufficientMaterial(Board $board): bool
    {
        $bishops = [];
        $minorPieceCount = 0;

        foreach ($board->getGrid() as $row => $pieces) {
            foreach ($pieces as $col => $piece) {
                if ($piece === null || $piece instanceof King) {
                    continue;
                }
                if (!($piece instanceof Bishop) && !($piece instanceof Knight)) {
                    return false;
                }

                $minorPieceCount++;
                if ($piece instanceof Bishop) {
                    $bishops[] = ($row + $col) % 2;
                }
            }
        }

        if ($minorPieceCount <= 1) {
            return true;
        }

        return count($bishops) === $minorPieceCount
            && count(array_unique($bishops)) === 1;
    }

    public function isLegalMove(Board $board, int $fromRow, int $fromCol, int $toRow, int $toCol): bool
    {
        foreach ($this->getLegalMoves($board, $fromRow, $fromCol) as [$row, $col]) {
            if ($row === $toRow && $col === $toCol) {
                return true;
            }
        }
        return false;
    }
}
