import { Chess } from 'chess.js';

export function applyPlayerMove(fen, playerColor, moveRequest) {
    const chess = new Chess(fen);
    const turnColor = chess.turn() === 'w' ? 'white' : 'black';
    if (playerColor !== turnColor) {
        throw new Error('Não é sua vez de jogar.');
    }

    if (!/^[a-h][1-8]$/.test(moveRequest.from || '') || !/^[a-h][1-8]$/.test(moveRequest.to || '')) {
        throw new Error('As casas informadas são inválidas.');
    }

    const promotion = moveRequest.promotion === undefined
        ? undefined
        : String(moveRequest.promotion).toLowerCase();
    if (promotion !== undefined && !['q', 'r', 'b', 'n'].includes(promotion)) {
        throw new Error('Peça de promoção inválida.');
    }

    let move;
    try {
        move = chess.move({
            from: moveRequest.from,
            to: moveRequest.to,
            ...(promotion ? { promotion } : {}),
        });
    } catch (error) {
        throw new Error(error.message || 'Jogada ilegal.');
    }

    const status = chess.isGameOver() ? 'finished' : 'active';
    const lastMove = {
        from: move.from,
        to: move.to,
        color: move.color === 'w' ? 'white' : 'black',
        piece: move.piece,
        captured: move.captured || null,
        promotion: move.promotion || null,
        flags: move.flags,
        captureAt: move.flags.includes('e')
            ? `${move.to[0]}${Number(move.to[1]) + (move.color === 'w' ? -1 : 1)}`
            : move.captured ? move.to : null,
        rookMove: move.flags.includes('k') || move.flags.includes('q')
            ? {
                from: `${move.flags.includes('k') ? 'h' : 'a'}${move.color === 'w' ? '1' : '8'}`,
                to: `${move.flags.includes('k') ? 'f' : 'd'}${move.color === 'w' ? '1' : '8'}`,
            }
            : null,
        san: move.san,
    };

    return {
        fen: chess.fen(),
        status,
        winnerColor: chess.isCheckmate()
            ? (chess.turn() === 'w' ? 'black' : 'white')
            : null,
        lastMove,
    };
}
