<?php

require_once __DIR__ . '/Board.php';
require_once __DIR__ . '/Rules.php';

/**
 * Game representa UMA partida em andamento. Enquanto Board é só o
 * "tabuleiro" e Rules é o "juiz", Game é quem sabe a história toda:
 * de quem é a vez, o que já foi jogado, e se a partida acabou.
 */
class Game
{
    private Board $board;
    private Rules $rules;
    private string $turn = 'white'; // brancas sempre começam
    private array $history = [];    // lista de jogadas já feitas
    private ?string $status = null; // null = em andamento, ou 'checkmate', 'stalemate'
    private ?string $winner = null;
    private int $halfmoveClock = 0;
    private array $positionOccurrences = [];

    public function __construct()
    {
        $this->board = new Board();
        $this->board->setupInitialPosition();
        $this->rules = new Rules();
        $this->positionOccurrences[$this->positionKey()] = 1;
    }

    public function getBoard(): Board
    {
        return $this->board;
    }

    public function getTurn(): string
    {
        return $this->turn;
    }

    public function getHistory(): array
    {
        return $this->history;
    }

    public function getStatus(): ?string
    {
        return $this->status;
    }

    public function getWinner(): ?string
    {
        return $this->winner;
    }

    public function isOver(): bool
    {
        return $this->status !== null;
    }

    public function getDrawClaims(): array
    {
        return [
            'threefoldRepetition' => ($this->positionOccurrences[$this->positionKey()] ?? 0) >= 3,
            'fiftyMoveRule' => $this->halfmoveClock >= 100,
        ];
    }

    /**
     * Tenta executar uma jogada. Retorna um array com o resultado —
     * é isso que o endpoint move.php vai transformar em JSON.
     */
    public function makeMove(
        int $fromRow,
        int $fromCol,
        int $toRow,
        int $toCol,
        string $promotion = 'Q'
    ): array
    {
        if ($this->isOver()) {
            return ['success' => false, 'error' => 'A partida já terminou.'];
        }

        if (
            !$this->board->isOnBoard($fromRow, $fromCol)
            || !$this->board->isOnBoard($toRow, $toCol)
        ) {
            return ['success' => false, 'error' => 'Coordenadas fora do tabuleiro.'];
        }

        $piece = $this->board->getPieceAt($fromRow, $fromCol);

        if ($piece === null) {
            return ['success' => false, 'error' => 'Não há peça nessa casa.'];
        }

        if ($piece->getColor() !== $this->turn) {
            return ['success' => false, 'error' => 'Não é a vez dessa cor.'];
        }

        $promotion = strtoupper($promotion);
        if (!in_array($promotion, ['Q', 'R', 'B', 'N'], true)) {
            return ['success' => false, 'error' => 'Peça de promoção inválida.'];
        }

        if (!$this->rules->isLegalMove($this->board, $fromRow, $fromCol, $toRow, $toCol)) {
            return ['success' => false, 'error' => 'Jogada ilegal.'];
        }

        // Executa de fato — só chegamos aqui se passou por todas as validações acima
        $captured = $this->board->movePiece($fromRow, $fromCol, $toRow, $toCol, $promotion);
        $lastMove = $this->board->getLastMove();
        $this->halfmoveClock = $piece instanceof Pawn || $captured !== null
            ? 0
            : $this->halfmoveClock + 1;

        $this->history[] = [
            'piece' => $piece->getSymbol(),
            'color' => $piece->getColor(),
            'from' => [$fromRow, $fromCol],
            'to' => [$toRow, $toCol],
            'captured' => $captured?->getSymbol(),
            'captureAt' => $lastMove['captureAt'],
            'promotion' => $lastMove['promotion'],
            'rookMove' => $lastMove['rookMove'],
        ];

        // Passa a vez
        $this->turn = $this->turn === 'white' ? 'black' : 'white';
        $positionKey = $this->positionKey();
        $this->positionOccurrences[$positionKey] = ($this->positionOccurrences[$positionKey] ?? 0) + 1;

        // Checa se a partida acabou para quem vai jogar agora
        $this->updateStatus();

        return [
            'success' => true,
            'captured' => $captured?->getSymbol(),
            'inCheck' => $this->rules->isInCheck($this->board, $this->turn),
            'status' => $this->status,
            'winner' => $this->winner,
            'turn' => $this->turn,
            'move' => [
                'from' => [$fromRow, $fromCol],
                'to' => [$toRow, $toCol],
                'captureAt' => $lastMove['captureAt'],
                'promotion' => $lastMove['promotion'],
                'rookMove' => $lastMove['rookMove'],
            ],
            'drawClaims' => $this->getDrawClaims(),
        ];
    }

    public function claimDraw(string $reason): array
    {
        if ($this->isOver()) {
            return ['success' => false, 'error' => 'A partida já terminou.'];
        }

        $claims = $this->getDrawClaims();
        if ($reason === 'repetition' && $claims['threefoldRepetition']) {
            $this->status = 'draw-repetition';
        } elseif ($reason === 'fifty-move' && $claims['fiftyMoveRule']) {
            $this->status = 'draw-fifty-move';
        } else {
            return ['success' => false, 'error' => 'Não há empate reivindicável por esse motivo.'];
        }

        return [
            'success' => true,
            'status' => $this->status,
            'winner' => null,
            'turn' => $this->turn,
            'drawClaims' => $this->getDrawClaims(),
        ];
    }

    /**
     * Depois de cada jogada, verifica se quem vai jogar agora está
     * em xeque-mate ou afogamento — se estiver, a partida terminou.
     */
    private function updateStatus(): void
    {
        if ($this->rules->isCheckmate($this->board, $this->turn)) {
            $this->status = 'checkmate';
            // quem acabou de jogar (a cor oposta ao turno atual) venceu
            $this->winner = $this->turn === 'white' ? 'black' : 'white';
        } elseif ($this->rules->isStalemate($this->board, $this->turn)) {
            $this->status = 'stalemate';
            $this->winner = null; // empate
        } elseif ($this->rules->isInsufficientMaterial($this->board)) {
            $this->status = 'draw-insufficient-material';
            $this->winner = null;
        } elseif (($this->positionOccurrences[$this->positionKey()] ?? 0) >= 5) {
            $this->status = 'draw-fivefold-repetition';
            $this->winner = null;
        } elseif ($this->halfmoveClock >= 150) {
            $this->status = 'draw-seventy-five-move';
            $this->winner = null;
        }
    }

    private function positionKey(): string
    {
        $position = '';
        foreach ($this->board->getGrid() as $row) {
            foreach ($row as $piece) {
                $position .= $piece === null
                    ? '-'
                    : $piece->getColor()[0] . $piece->getSymbol();
            }
        }

        $rights = $this->board->getCastlingRights();
        $castling = '';
        foreach (['white' => ['kingSide' => 'K', 'queenSide' => 'Q'], 'black' => ['kingSide' => 'k', 'queenSide' => 'q']] as $color => $sides) {
            foreach ($sides as $side => $symbol) {
                if ($rights[$color][$side]) {
                    $castling .= $symbol;
                }
            }
        }

        $enPassant = $this->board->getEnPassantTarget();
        $target = $enPassant === null ? '-' : implode(',', $enPassant);
        return $position . '|' . $this->turn . '|' . ($castling ?: '-') . '|' . $target;
    }
}