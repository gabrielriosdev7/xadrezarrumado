<?php

require_once __DIR__ . '/bootstrap.php';

$game = loadGameFromSession();
if ($game === null) {
    jsonResponse(['success' => false, 'error' => 'Nenhuma partida em andamento.'], 400);
}

$body = getJsonBody();
if (!isset($body['reason']) || !is_string($body['reason'])) {
    jsonResponse(['success' => false, 'error' => 'Motivo da reivindicação ausente ou inválido.'], 400);
}

$result = $game->claimDraw($body['reason']);
if ($result['success']) {
    saveGameToSession($game);
}

jsonResponse($result, $result['success'] ? 200 : 400);
