<?php

/**
 * Arquivo carregado por TODOS os endpoints em api/.
 * Responsável por:
 *  - iniciar a sessão PHP (partida em andamento e autenticação)
 *  - carregar as classes do jogo
 *  - fornecer funções auxiliares para salvar/recuperar o Game da sessão
 *
 * O estado temporário da partida fica na sessão; as contas ficam no banco.
 */

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_set_cookie_params([
    'httponly' => true,
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
]);
session_start();

require_once __DIR__ . '/../../src/Piece.php';
require_once __DIR__ . '/../../src/Board.php';
require_once __DIR__ . '/../../src/Rules.php';
require_once __DIR__ . '/../../src/Game.php';
require_once __DIR__ . '/../../src/AI.php';

header('Content-Type: application/json; charset=utf-8');

/**
 * Recupera a partida atual da sessão (ou null se não há nenhuma).
 * Usamos serialize/unserialize do PHP para guardar o objeto Game
 * inteiro — por isso é essencial que as classes já estejam
 * carregadas (require_once acima) ANTES do unserialize.
 */
function loadGameFromSession(): ?Game
{
    if (!isset($_SESSION['game'])) {
        return null;
    }
    return unserialize($_SESSION['game']);
}

/**
 * Salva a partida atual na sessão, para a próxima requisição
 * conseguir recuperá-la.
 */
function saveGameToSession(Game $game): void
{
    $_SESSION['game'] = serialize($game);
}

/**
 * Helper para responder em JSON e encerrar o script.
 */
function jsonResponse(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

/**
 * Lê o corpo da requisição (JSON enviado pelo fetch do JS) e
 * devolve como array associativo.
 */
function getJsonBody(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}