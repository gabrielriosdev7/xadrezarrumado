import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { applyPlayerMove } from '../server/game-logic.js';

const GAME_FIELDS = 'id, code, created_by, white_player, black_player, fen, version, status, winner_color, last_move, created_at, updated_at';
const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function respond(res, status, payload) {
    return res.status(status).json(payload);
}

function createSupabaseClients() {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
        throw new Error('Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no Vercel.');
    }

    return {
        authClient: createClient(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        }),
        adminClient: createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        }),
    };
}

async function authenticate(req, authClient) {
    const authorization = req.headers.authorization || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
        return null;
    }

    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) {
        return null;
    }

    return data.user;
}

function createRoomCode() {
    return Array.from(
        { length: 6 },
        () => CODE_CHARACTERS[randomInt(CODE_CHARACTERS.length)]
    ).join('');
}

async function getGame(adminClient, id) {
    const { data, error } = await adminClient
        .from('games')
        .select(GAME_FIELDS)
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw error;
    }
    return data;
}

function isPlayer(game, userId) {
    return game && (game.white_player === userId || game.black_player === userId);
}

function playerColor(game, userId) {
    if (game.white_player === userId) return 'white';
    if (game.black_player === userId) return 'black';
    return null;
}

function gameResponse(game) {
    return {
        id: game.id,
        code: game.code,
        createdBy: game.created_by,
        whitePlayer: game.white_player,
        blackPlayer: game.black_player,
        fen: game.fen,
        version: game.version,
        status: game.status,
        winnerColor: game.winner_color,
        lastMove: game.last_move,
        createdAt: game.created_at,
        updatedAt: game.updated_at,
    };
}

async function createGame(adminClient, userId) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await adminClient
            .from('games')
            .insert({
                code: createRoomCode(),
                created_by: userId,
                white_player: userId,
            })
            .select(GAME_FIELDS)
            .single();

        if (!error) return data;
        if (error.code !== '23505') throw error;
    }

    throw new Error('Não foi possível gerar um código de sala. Tente novamente.');
}

async function joinGame(adminClient, code, userId) {
    const { data: game, error: findError } = await adminClient
        .from('games')
        .select(GAME_FIELDS)
        .eq('code', code)
        .eq('status', 'waiting')
        .is('black_player', null)
        .maybeSingle();

    if (findError) throw findError;
    if (!game) {
        const { data: existingGame, error } = await adminClient
            .from('games')
            .select(GAME_FIELDS)
            .eq('code', code)
            .maybeSingle();
        if (error) throw error;
        if (isPlayer(existingGame, userId)) return existingGame;
        throw new Error('Sala não encontrada ou a partida já está cheia.');
    }
    if (game.white_player === userId) {
        throw new Error('Entre com outra conta para jogar contra seu amigo.');
    }

    const { data: joinedGame, error: joinError } = await adminClient
        .from('games')
        .update({
            black_player: userId,
            status: 'active',
            updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('version', game.version)
        .eq('status', 'waiting')
        .is('black_player', null)
        .select(GAME_FIELDS)
        .maybeSingle();

    if (joinError) throw joinError;
    if (!joinedGame) {
        throw new Error('Outro jogador entrou nesta sala primeiro. Peça um novo convite.');
    }

    return joinedGame;
}

async function submitMove(adminClient, game, userId, body) {
    if (game.status !== 'active') {
        throw new Error('Esta partida não está em andamento.');
    }
    if (!isPlayer(game, userId)) {
        throw new Error('Você não participa desta partida.');
    }
    if (!Number.isInteger(body.version) || body.version !== game.version) {
        throw new Error('O tabuleiro foi atualizado. Aguarde a jogada do outro jogador.');
    }
    if (!/^[a-h][1-8]$/.test(body.from || '') || !/^[a-h][1-8]$/.test(body.to || '')) {
        throw new Error('As casas informadas são inválidas.');
    }

    const result = applyPlayerMove(game.fen, playerColor(game, userId), body);

    const { data: updatedGame, error } = await adminClient
        .from('games')
        .update({
            fen: result.fen,
            version: game.version + 1,
            status: result.status,
            winner_color: result.winnerColor,
            last_move: result.lastMove,
            updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('version', game.version)
        .eq('status', 'active')
        .select(GAME_FIELDS)
        .maybeSingle();

    if (error) throw error;
    if (!updatedGame) {
        throw new Error('A partida mudou enquanto sua jogada era enviada. Atualize o tabuleiro.');
    }
    return updatedGame;
}

async function resignGame(adminClient, game, userId, version) {
    if (game.status !== 'active' || !isPlayer(game, userId)) {
        throw new Error('Você não pode desistir desta partida.');
    }
    if (!Number.isInteger(version) || version !== game.version) {
        throw new Error('A partida foi atualizada. Recarregue o tabuleiro e tente novamente.');
    }

    const resigningColor = playerColor(game, userId);
    const { data, error } = await adminClient
        .from('games')
        .update({
            status: 'finished',
            winner_color: resigningColor === 'white' ? 'black' : 'white',
            version: game.version + 1,
            updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('version', game.version)
        .eq('status', 'active')
        .select(GAME_FIELDS)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('A partida mudou. Atualize e tente novamente.');
    return data;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return respond(res, 405, { success: false, error: 'Método não permitido.' });
    }

    try {
        const { authClient, adminClient } = createSupabaseClients();
        const user = await authenticate(req, authClient);
        if (!user) {
            return respond(res, 401, { success: false, error: 'Entre na sua conta para jogar online.' });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return respond(res, 400, { success: false, error: 'Corpo da requisição inválido.' });
        }

        let game;
        if (body.action === 'create') {
            game = await createGame(adminClient, user.id);
        } else if (body.action === 'join') {
            const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
            if (!/^[A-Z0-9]{6}$/.test(code)) {
                return respond(res, 400, { success: false, error: 'Informe um código de convite válido, com 6 caracteres.' });
            }
            game = await joinGame(adminClient, code, user.id);
        } else {
            if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) {
                return respond(res, 400, { success: false, error: 'Partida inválida.' });
            }

            const existingGame = await getGame(adminClient, body.id);
            if (!existingGame || !isPlayer(existingGame, user.id)) {
                return respond(res, 404, { success: false, error: 'Partida não encontrada.' });
            }

            if (body.action === 'state') {
                game = existingGame;
            } else if (body.action === 'move') {
                game = await submitMove(adminClient, existingGame, user.id, body);
            } else if (body.action === 'resign') {
                game = await resignGame(adminClient, existingGame, user.id, body.version);
            } else {
                return respond(res, 400, { success: false, error: 'Ação desconhecida.' });
            }
        }

        return respond(res, 200, { success: true, game: gameResponse(game) });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro inesperado ao processar a partida.';
        const expected = [
            'Jogada ilegal',
            'movimento ilegal',
            'Invalid move',
            'Sala não encontrada',
            'Entre com outra conta',
            'Outro jogador entrou',
            'partida não está',
            'não participa',
            'tabuleiro foi atualizado',
            'Não é sua vez',
            'Peça de promoção',
            'A partida mudou',
            'Você não pode desistir',
        ].some(fragment => message.toLowerCase().includes(fragment.toLowerCase()));
        if (!expected) console.error('Falha na API de partidas:', error);
        return respond(res, expected ? 409 : 500, { success: false, error: message });
    }
}
