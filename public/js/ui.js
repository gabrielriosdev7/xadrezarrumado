import { Chess } from 'chess.js';
import { Board } from './board.js';
import { callGameApi } from './api.js';
import { getSupabaseConfigurationError, requireSupabase } from './supabase.js';

const statusEl = document.getElementById('status');
const newGameBtn = document.getElementById('new-game-btn');
const modeSelect = document.getElementById('mode-select');
const difficultySelect = document.getElementById('difficulty-select');
const promotionDialog = document.getElementById('promotion-dialog');
const accountUserLabel = document.getElementById('account-user-label');
const accountLink = document.getElementById('account-link');
const logoutBtn = document.getElementById('logout-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomForm = document.getElementById('join-room-form');
const roomCodeInput = document.getElementById('room-code-input');
const invitePanel = document.getElementById('invite-panel');
const onlineStatus = document.getElementById('online-status');
const inviteLinkInput = document.getElementById('invite-link');
const copyInviteBtn = document.getElementById('copy-invite-btn');
const resignBtn = document.getElementById('resign-btn');

const HUMAN_COLOR = 'white';
const AI_THINKING_TIME = 700;
let chess = new Chess();
let currentMode = 'player-vs-ai';
let onlineGame = null;
let onlineColor = null;
let onlineChannel = null;
let signedInUser = null;
let selectedSquare = null;
let legalMoves = [];
let isBusy = false;
let aiTimer = null;

function setStatus(message, state = '') {
    statusEl.textContent = message;
    statusEl.dataset.state = state;
}

function setOnlineStatus(message, state = '') {
    onlineStatus.textContent = message;
    onlineStatus.dataset.state = state;
}

function squareCoordinates(square) {
    return [8 - Number(square[1]), square.charCodeAt(0) - 97];
}

function squareName(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function getBoardState() {
    return chess.board().map(row => row.map(piece => piece
        ? { type: piece.type.toUpperCase(), color: piece.color === 'w' ? 'white' : 'black' }
        : null));
}

function getMoveAnimation(move) {
    if (!move) return null;
    const to = squareCoordinates(move.to);
    return {
        from: squareCoordinates(move.from),
        to,
        captureAt: move.captureAt
            ? squareCoordinates(move.captureAt)
            : move.flags?.includes('e')
                ? [to[0] + (move.color === 'w' ? 1 : -1), to[1]]
                : null,
        promotion: move.promotion || null,
        rookMove: move.rookMove
            ? { from: squareCoordinates(move.rookMove.from), to: squareCoordinates(move.rookMove.to) }
            : move.flags?.includes('k') || move.flags?.includes('q')
            ? {
                from: [move.color === 'w' ? 7 : 0, move.flags.includes('k') ? 7 : 0],
                to: [move.color === 'w' ? 7 : 0, move.flags.includes('k') ? 5 : 3],
            }
            : null,
    };
}

async function renderBoard(move = null) {
    if (move?.captured) Board.playCaptureSound();
    await Board.render(getBoardState(), selectedSquare, legalMoves, getMoveAnimation(move), Boolean(move?.captured));
}

function describeTurn() {
    if (onlineGame?.status === 'waiting') {
        setStatus(`Sala ${onlineGame.code} criada. Compartilhe o link e aguarde seu amigo.`);
        setOnlineStatus('Aguardando seu amigo entrar na sala…', 'thinking');
        return;
    }

    if (onlineGame?.status === 'finished' && !chess.isGameOver()) {
        const winner = onlineGame.winnerColor;
        const result = winner
            ? `Partida encerrada. ${winner === 'white' ? 'Brancas' : 'Pretas'} venceram.`
            : 'Partida encerrada em empate.';
        setStatus(result, 'finished');
        setOnlineStatus(result, 'finished');
        return;
    }

    if (chess.isCheckmate()) {
        const winner = chess.turn() === 'w' ? 'Pretas' : 'Brancas';
        setStatus(`Xeque-mate! Vencedor: ${winner}.`, 'finished');
        if (onlineGame) setOnlineStatus(`Partida encerrada: ${winner} venceram.`, 'finished');
        return;
    }

    if (chess.isGameOver()) {
        const message = chess.isStalemate()
            ? 'Empate por afogamento.'
            : chess.isThreefoldRepetition()
                ? 'Empate por repetição.'
                : chess.isInsufficientMaterial()
                    ? 'Empate por material insuficiente.'
                    : chess.isDrawByFiftyMoves()
                        ? 'Empate pela regra dos 50 lances.'
                        : 'Partida empatada.';
        setStatus(message, 'finished');
        if (onlineGame) setOnlineStatus(message, 'finished');
        return;
    }

    const turn = chess.turn() === 'w' ? 'white' : 'black';
    const label = turn === 'white' ? 'Brancas' : 'Pretas';
    if (onlineGame) {
        const ownTurn = turn === onlineColor;
        const checkMessage = chess.isCheck() ? `${label} em xeque! ` : '';
        const message = `${checkMessage}${ownTurn ? 'Sua vez' : 'Vez do seu amigo'} (${label}).`;
        setStatus(message, ownTurn ? '' : 'thinking');
        setOnlineStatus(`Você joga com ${onlineColor === 'white' ? 'as brancas' : 'as pretas'}. ${message}`);
    } else {
        setStatus(chess.isCheck() ? `${label} em xeque! Vez de ${label}.` : `Vez de: ${label}`);
    }
}

function leaveOnlineRoom() {
    if (onlineChannel && getSupabaseConfigurationError() === null) {
        requireSupabase().removeChannel(onlineChannel);
    }
    onlineChannel = null;
    onlineGame = null;
    onlineColor = null;
    invitePanel.hidden = true;
    resignBtn.hidden = true;
    window.history.replaceState({}, '', window.location.pathname);
}

function updateAccount(user) {
    signedInUser = user;
    accountUserLabel.textContent = user
        ? `Olá, ${user.user_metadata?.display_name || user.email || 'jogador'}!`
        : 'Jogue localmente ou entre na sua conta para jogar online.';
    accountLink.hidden = Boolean(user);
    logoutBtn.hidden = !user;
}

function requireLogin() {
    if (signedInUser) return true;
    const returnUrl = window.location.search;
    window.location.assign(`auth.html${returnUrl}`);
    return false;
}

function syncInvitePanel(game) {
    invitePanel.hidden = false;
    inviteLinkInput.value = `${window.location.origin}${window.location.pathname}?join=${game.code}`;
    resignBtn.hidden = game.status !== 'active';
}

async function syncOnlineGame(game) {
    if (onlineGame?.id === game.id && game.version < onlineGame.version) return;
    const changed = !onlineGame || onlineGame.version !== game.version || onlineGame.status !== game.status;
    onlineGame = game;
    onlineColor = game.whitePlayer === signedInUser?.id ? 'white'
        : game.blackPlayer === signedInUser?.id ? 'black' : null;
    chess.load(game.fen);
    selectedSquare = null;
    legalMoves = [];
    syncInvitePanel(game);
    window.history.replaceState({}, '', `${window.location.pathname}?game=${game.id}`);
    if (changed) await renderBoard(game.lastMove);
    describeTurn();
}

async function subscribeToGame(gameId) {
    if (onlineChannel) await requireSupabase().removeChannel(onlineChannel);
    onlineChannel = requireSupabase()
        .channel(`game-${gameId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
        }, async () => {
            if (!onlineGame) return;
            try {
                const freshGame = await callGameApi('state', { id: gameId });
                await syncOnlineGame(freshGame);
            } catch (error) {
                setOnlineStatus(error.message, 'error');
            }
        })
        .subscribe(async (state, error) => {
            if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
                setOnlineStatus(`Conexão em tempo real instável: ${error?.message || state}.`, 'error');
            } else if (state === 'SUBSCRIBED' && !isBusy) {
                try {
                    await syncOnlineGame(await callGameApi('state', { id: gameId }));
                } catch (syncError) {
                    setOnlineStatus(syncError.message, 'error');
                }
            }
        });
}

async function openOnlineGame(game) {
    stopAiLoop();
    currentMode = 'online';
    modeSelect.disabled = true;
    createRoomBtn.disabled = false;
    roomCodeInput.value = '';
    await syncOnlineGame(game);
    await subscribeToGame(game.id);
}

function stopAiLoop() {
    if (aiTimer !== null) {
        clearTimeout(aiTimer);
        aiTimer = null;
    }
}

function choosePromotion() {
    return new Promise(resolve => {
        promotionDialog.addEventListener('close', () => {
            resolve(promotionDialog.returnValue || 'q');
        }, { once: true });
        promotionDialog.showModal();
    });
}

function listLegalMoves(row, col) {
    return chess.moves({ square: squareName(row, col), verbose: true })
        .map(move => squareCoordinates(move.to));
}

async function sendMove(from, to, promotion) {
    if (onlineGame) {
        const updatedGame = await callGameApi('move', {
            id: onlineGame.id,
            version: onlineGame.version,
            from,
            to,
            promotion,
        });
        await syncOnlineGame(updatedGame);
        return;
    }

    let move;
    try {
        move = chess.move({ from, to, promotion });
    } catch (error) {
        setStatus(error.message, 'error');
        return;
    }
    await renderBoard(move);
    describeTurn();

    if (currentMode === 'ai-vs-ai' || (currentMode === 'player-vs-ai' && chess.turn() === 'b')) {
        scheduleAiMove();
    }
}

async function handleSquareClick(row, col) {
    if (isBusy || chess.isGameOver()) return;
    if (onlineGame && (onlineGame.status !== 'active' || onlineColor !== (chess.turn() === 'w' ? 'white' : 'black'))) {
        return;
    }
    if (!onlineGame && currentMode === 'ai-vs-ai') return;
    if (!onlineGame && currentMode === 'player-vs-ai' && chess.turn() !== 'w') return;

    Board.prepareAudio();
    const clickedSquare = squareName(row, col);
    const clickedPiece = chess.get(clickedSquare);
    const turnColor = chess.turn();

    if (selectedSquare === null) {
        if (!clickedPiece || clickedPiece.color !== turnColor) return;
        selectedSquare = [row, col];
        legalMoves = listLegalMoves(row, col);
        await Board.render(getBoardState(), selectedSquare, legalMoves);
        return;
    }

    const [fromRow, fromCol] = selectedSquare;
    const from = squareName(fromRow, fromCol);
    if (clickedSquare === from) {
        selectedSquare = null;
        legalMoves = [];
        await Board.render(getBoardState());
        return;
    }
    if (clickedPiece?.color === turnColor) {
        selectedSquare = [row, col];
        legalMoves = listLegalMoves(row, col);
        await Board.render(getBoardState(), selectedSquare, legalMoves);
        return;
    }
    if (!legalMoves.some(([moveRow, moveCol]) => moveRow === row && moveCol === col)) return;

    selectedSquare = null;
    legalMoves = [];
    isBusy = true;
    newGameBtn.disabled = true;
    try {
        const piece = chess.get(from);
        const promotion = piece?.type === 'p' && (row === 0 || row === 7)
            ? await choosePromotion()
            : undefined;
        await sendMove(from, clickedSquare, promotion);
    } catch (error) {
        setStatus(error.message, 'error');
        if (onlineGame) {
            try {
                await syncOnlineGame(await callGameApi('state', { id: onlineGame.id }));
            } catch (refreshError) {
                setOnlineStatus(refreshError.message, 'error');
            }
        }
    } finally {
        isBusy = false;
        newGameBtn.disabled = false;
    }
}

function chooseAiMove() {
    const moves = chess.moves({ verbose: true });
    if (difficultySelect.value === 'greedy') {
        const captures = moves.filter(move => move.captured);
        if (captures.length) return captures[Math.floor(Math.random() * captures.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
}

function scheduleAiMove() {
    stopAiLoop();
    if (chess.isGameOver()) return;
    setStatus('IA pensando...', 'thinking');
    aiTimer = setTimeout(async () => {
        aiTimer = null;
        const move = chooseAiMove();
        if (move) {
            chess.move(move);
            await renderBoard(move);
            describeTurn();
            if (currentMode === 'ai-vs-ai') scheduleAiMove();
        }
    }, AI_THINKING_TIME);
}

async function requireSessionForOnline() {
    if (!requireLogin()) return null;
    return signedInUser;
}

createRoomBtn.addEventListener('click', async () => {
    if (!await requireSessionForOnline()) return;
    createRoomBtn.disabled = true;
    setOnlineStatus('Criando sala…', 'thinking');
    invitePanel.hidden = false;
    try {
        await openOnlineGame(await callGameApi('create'));
    } catch (error) {
        setOnlineStatus(error.message, 'error');
        createRoomBtn.disabled = false;
    }
});

joinRoomForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!await requireSessionForOnline()) return;
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        setOnlineStatus('Digite o código de convite com 6 caracteres.', 'error');
        invitePanel.hidden = false;
        return;
    }

    setOnlineStatus('Entrando na sala…', 'thinking');
    invitePanel.hidden = false;
    try {
        await openOnlineGame(await callGameApi('join', { code }));
    } catch (error) {
        setOnlineStatus(error.message, 'error');
    }
});

copyInviteBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(inviteLinkInput.value);
        copyInviteBtn.textContent = 'Copiado!';
        setTimeout(() => { copyInviteBtn.textContent = 'Copiar'; }, 1800);
    } catch {
        inviteLinkInput.select();
        document.execCommand('copy');
        setOnlineStatus('Link copiado.');
    }
});

resignBtn.addEventListener('click', async () => {
    if (!onlineGame || onlineGame.status !== 'active' || isBusy) return;
    isBusy = true;
    resignBtn.disabled = true;
    try {
        await syncOnlineGame(await callGameApi('resign', {
            id: onlineGame.id,
            version: onlineGame.version,
        }));
    } catch (error) {
        setOnlineStatus(error.message, 'error');
    } finally {
        isBusy = false;
        resignBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
        leaveOnlineRoom();
        await requireSupabase().auth.signOut();
    } catch (error) {
        accountUserLabel.textContent = error.message;
    } finally {
        logoutBtn.disabled = false;
    }
});

newGameBtn.addEventListener('click', async () => {
    stopAiLoop();
    leaveOnlineRoom();
    currentMode = modeSelect.value;
    modeSelect.disabled = false;
    chess = new Chess();
    selectedSquare = null;
    legalMoves = [];
    await renderBoard();
    describeTurn();
    if (currentMode === 'ai-vs-ai') scheduleAiMove();
});

Board.onSquareClick = handleSquareClick;

async function initialize() {
    const configurationError = getSupabaseConfigurationError();
    if (configurationError) {
        updateAccount(null);
        accountUserLabel.textContent = configurationError;
        createRoomBtn.disabled = true;
        joinRoomForm.querySelector('button').disabled = true;
    } else {
        const supabase = requireSupabase();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        updateAccount(data.session?.user || null);
        supabase.auth.onAuthStateChange((_event, session) => updateAccount(session?.user || null));
    }

    await renderBoard();
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('game');
    const inviteCode = params.get('join')?.toUpperCase();

    if (!roomId && !inviteCode) return;
    if (!signedInUser) {
        if (inviteCode) roomCodeInput.value = inviteCode;
        setOnlineStatus('Entre na sua conta para abrir o convite ou continuar a partida.');
        invitePanel.hidden = false;
        if (roomId) {
            const loginUrl = new URL('auth.html', window.location.href);
            loginUrl.searchParams.set('game', roomId);
            accountLink.href = `${loginUrl.pathname}${loginUrl.search}`;
        } else if (inviteCode && /^[A-Z0-9]{6}$/.test(inviteCode)) {
            accountLink.href = `auth.html?join=${encodeURIComponent(inviteCode)}`;
        }
        return;
    }

    if (roomId) {
        await openOnlineGame(await callGameApi('state', { id: roomId }));
    } else if (inviteCode && /^[A-Z0-9]{6}$/.test(inviteCode)) {
        roomCodeInput.value = inviteCode;
        await openOnlineGame(await callGameApi('join', { code: inviteCode }));
    }
}

initialize().catch(error => {
    setOnlineStatus(error.message, 'error');
    if (new URLSearchParams(window.location.search).has('game')
        || new URLSearchParams(window.location.search).has('join')) {
        invitePanel.hidden = false;
    }
});
