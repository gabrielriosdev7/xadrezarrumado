<?php

require_once __DIR__ . '/bootstrap.php';

$game = loadGameFromSession();

if ($game === null) {
    jsonResponse(['success' => false, 'error' => 'Nenhuma partida em andamento.'], 400);
}

if ($game->isOver()) {
    jsonResponse(['success' => false, 'error' => 'A partida já terminou.'], 400);
}

$body = getJsonBody();
foreach (['row', 'col'] as $field) {
    if (!isset($body[$field]) || !is_int($body[$field]) || $body[$field] < 0 || $body[$field] > 7) {
        jsonResponse(['success' => false, 'error' => "Campo '$field' ausente ou inválido."], 400);
    }
}

$piece = $game->getBoard()->getPieceAt($body['row'], $body['col']);
$moves = [];
if ($piece !== null && $piece->getColor() === $game->getTurn()) {
    $rules = new Rules();
    $moves = $rules->getLegalMoves($game->getBoard(), $body['row'], $body['col']);
}

jsonResponse(['success' => true, 'moves' => $moves]);
