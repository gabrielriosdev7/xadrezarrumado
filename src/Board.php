<?php

require_once __DIR__ . '/Piece.php';

/**
 * Representa o estado de um tabuleiro de xadrez: uma matriz 8x8
 * onde cada casa é null (vazia) ou um objeto Piece.
 *
 * Convenção de coordenadas: [linha][coluna], ambos de 0 a 7.
 * linha 0 = topo do tabuleiro (fileira 8, onde começam as pretas)
 * linha 7 = base do tabuleiro (fileira 1, onde começam as brancas)
 */
class Board
{
    private array $grid; // grid[linha][coluna] = Piece|null
    private ?array $lastMove = null; // guarda última jogada (necessário p/ en passant)

    public function __construct()
    {
        $this->grid = array_fill(0, 8, array_fill(0, 8, null));
    }

    /**
     * Monta a posição inicial padrão do xadrez.
     */
    public function setupInitialPosition(): void
    {
        $backRank = [
            Rook::class, Knight::class, Bishop::class, Queen::class,
            King::class, Bishop::class, Knight::class, Rook::class,
        ];

        for ($col = 0; $col < 8; $col++) {
            $this->grid[0][$col] = new $backRank[$col]('black');
            $this->grid[1][$col] = new Pawn('black');
            $this->grid[6][$col] = new Pawn('white');
            $this->grid[7][$col] = new $backRank[$col]('white');
        }
    }

    public function getPieceAt(int $row, int $col): ?Piece
    {
        if (!$this->isOnBoard($row, $col)) {
            return null;
        }
        return $this->grid[$row][$col];
    }

    public function setPieceAt(int $row, int $col, ?Piece $piece): void
    {
        $this->grid[$row][$col] = $piece;
    }

    public function getGrid(): array
    {
        return $this->grid;
    }

    public function isOnBoard(int $row, int $col): bool
    {
        return $row >= 0 && $row < 8 && $col >= 0 && $col < 8;
    }

    /**
     * Move uma peça sem validar se é legal — validação é papel da
     * classe Rules. Board só executa e mantém o estado consistente.
     */
    public function movePiece(
        int $fromRow,
        int $fromCol,
        int $toRow,
        int $toCol,
        string $promotion = 'Q'
    ): ?Piece
    {
        $piece = $this->grid[$fromRow][$fromCol];
        $captured = $this->grid[$toRow][$toCol];
        $capturedRow = $toRow;
        $capturedCol = $toCol;
        $rookMove = null;

        if ($piece instanceof Pawn && $fromCol !== $toCol && $captured === null) {
            $capturedRow = $fromRow;
            $captured = $this->grid[$capturedRow][$toCol];
            $this->grid[$capturedRow][$toCol] = null;
        }

        if ($piece instanceof King && abs($toCol - $fromCol) === 2) {
            $rookFromCol = $toCol > $fromCol ? 7 : 0;
            $rookToCol = $toCol > $fromCol ? $toCol - 1 : $toCol + 1;
            $rook = $this->grid[$fromRow][$rookFromCol];
            $this->grid[$fromRow][$rookToCol] = $rook;
            $this->grid[$fromRow][$rookFromCol] = null;
            $rook?->markAsMoved();
            $rookMove = [
                'from' => [$fromRow, $rookFromCol],
                'to' => [$fromRow, $rookToCol],
            ];
        }

        $this->grid[$toRow][$toCol] = $piece;
        $this->grid[$fromRow][$fromCol] = null;
        $piece?->markAsMoved();

        $promotedTo = null;
        if ($piece instanceof Pawn && ($toRow === 0 || $toRow === 7)) {
            $promotedTo = strtoupper($promotion);
            $this->grid[$toRow][$toCol] = match ($promotedTo) {
                'R' => new Rook($piece->getColor()),
                'B' => new Bishop($piece->getColor()),
                'N' => new Knight($piece->getColor()),
                default => new Queen($piece->getColor()),
            };
            $this->grid[$toRow][$toCol]->markAsMoved();
        }

        $this->lastMove = compact('fromRow', 'fromCol', 'toRow', 'toCol')
            + ['captureAt' => $captured === null ? null : [$capturedRow, $capturedCol]]
            + ['promotion' => $promotedTo, 'rookMove' => $rookMove];

        return $captured; // devolve a peça capturada (ou null), útil pro histórico
    }

    public function getLastMove(): ?array
    {
        return $this->lastMove;
    }

    public function getCastlingRights(): array
    {
        $rights = [];
        foreach (['white' => 7, 'black' => 0] as $color => $row) {
            $king = $this->grid[$row][4];
            $rights[$color] = [
                'kingSide' => $king instanceof King
                    && $king->getColor() === $color
                    && !$king->hasMoved()
                    && $this->grid[$row][7] instanceof Rook
                    && $this->grid[$row][7]->getColor() === $color
                    && !$this->grid[$row][7]->hasMoved(),
                'queenSide' => $king instanceof King
                    && $king->getColor() === $color
                    && !$king->hasMoved()
                    && $this->grid[$row][0] instanceof Rook
                    && $this->grid[$row][0]->getColor() === $color
                    && !$this->grid[$row][0]->hasMoved(),
            ];
        }
        return $rights;
    }

    public function getEnPassantTarget(): ?array
    {
        if ($this->lastMove === null || abs($this->lastMove['toRow'] - $this->lastMove['fromRow']) !== 2) {
            return null;
        }

        $pawn = $this->grid[$this->lastMove['toRow']][$this->lastMove['toCol']];
        if (!($pawn instanceof Pawn)) {
            return null;
        }

        $targetRow = intdiv($this->lastMove['fromRow'] + $this->lastMove['toRow'], 2);
        foreach ([-1, 1] as $offset) {
            $adjacent = $this->getPieceAt($this->lastMove['toRow'], $this->lastMove['toCol'] + $offset);
            if ($adjacent instanceof Pawn && $adjacent->getColor() !== $pawn->getColor()) {
                return [$targetRow, $this->lastMove['toCol']];
            }
        }

        return null;
    }

    /**
     * Encontra a posição do rei de uma cor — usado o tempo todo
     * pela classe Rules para checar se ele está em xeque.
     */
    public function findKing(string $color): ?array
    {
        for ($row = 0; $row < 8; $row++) {
            for ($col = 0; $col < 8; $col++) {
                $piece = $this->grid[$row][$col];
                if ($piece instanceof King && $piece->getColor() === $color) {
                    return [$row, $col];
                }
            }
        }
        return null; // não deveria acontecer numa partida válida
    }

    /**
     * Cria uma cópia profunda do tabuleiro — essencial para simular
     * jogadas ("e se eu mover aqui, meu rei fica em xeque?") sem
     * bagunçar o estado real da partida.
     */
    public function clone(): Board
    {
        return clone $this;
    }

    public function __clone()
    {
        foreach ($this->grid as $row => $cols) {
            foreach ($cols as $col => $piece) {
                $this->grid[$row][$col] = $piece === null ? null : clone $piece;
            }
        }
    }

    /**
     * Converte o tabuleiro inteiro numa matriz simples de
     * arrays/null, pronta para json_encode() mandar pro front-end.
     */
    public function toArray(): array
    {
        $result = [];
        for ($row = 0; $row < 8; $row++) {
            for ($col = 0; $col < 8; $col++) {
                $piece = $this->grid[$row][$col];
                $result[$row][$col] = $piece?->toArray();
            }
        }
        return $result;
    }

    /**
     * Representação simples em texto, útil para depurar no terminal
     * enquanto você desenvolve, antes mesmo de ter o front pronto.
     */
    public function __toString(): string
    {
        $output = '';
        for ($row = 0; $row < 8; $row++) {
            for ($col = 0; $col < 8; $col++) {
                $piece = $this->grid[$row][$col];
                if ($piece === null) {
                    $output .= '. ';
                } else {
                    $symbol = $piece->getSymbol();
                    $output .= ($piece->getColor() === 'white' ? $symbol : strtolower($symbol)) . ' ';
                }
            }
            $output .= PHP_EOL;
        }
        return $output;
    }
}
