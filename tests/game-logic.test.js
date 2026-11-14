import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { applyPlayerMove } from '../server/game-logic.js';

test('a valida jogada legal e troca a vez', () => {
    const result = applyPlayerMove(new Chess().fen(), 'white', {
        from: 'e2',
        to: 'e4',
    });

    assert.equal(new Chess(result.fen).turn(), 'b');
    assert.equal(result.status, 'active');
    assert.equal(result.winnerColor, null);
    assert.equal(result.lastMove.san, 'e4');
});

test('b rejeita uma jogada fora da vez', () => {
    assert.throws(
        () => applyPlayerMove(new Chess().fen(), 'black', { from: 'e7', to: 'e5' }),
        /Não é sua vez/
    );
});

test('c rejeita uma jogada ilegal', () => {
    assert.throws(
        () => applyPlayerMove(new Chess().fen(), 'white', { from: 'e2', to: 'e5' })
    );
});

test('d detecta xeque-mate e vencedor', () => {
    const chess = new Chess();
    chess.load('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
    const result = applyPlayerMove(chess.fen(), 'black', { from: 'd8', to: 'h4' });

    assert.equal(result.status, 'finished');
    assert.equal(result.winnerColor, 'black');
    assert.equal(result.lastMove.san, 'Qh4#');
});
