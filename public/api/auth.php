<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/../../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'error' => 'Método não permitido.'], 405);
}

$body = getJsonBody();
$action = $body['action'] ?? null;

if (!is_string($action)) {
    jsonResponse(['success' => false, 'error' => 'Ação ausente ou inválida.'], 400);
}

function publicUser(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
    ];
}

try {
    if ($action === 'register') {
        $name = $body['name'] ?? null;
        $email = $body['email'] ?? null;
        $password = $body['password'] ?? null;

        if (
            !is_string($name)
            || !preg_match('/\A.{1,100}\z/u', trim($name))
        ) {
            jsonResponse(['success' => false, 'error' => 'Informe um nome com até 100 caracteres.'], 400);
        }

        if (!is_string($email)) {
            jsonResponse(['success' => false, 'error' => 'Informe um e-mail válido.'], 400);
        }

        $email = strtolower(trim($email));
        if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['success' => false, 'error' => 'Informe um e-mail válido.'], 400);
        }

        if (!is_string($password) || !preg_match('/\A.{8,}\z/us', $password) || strlen($password) > 72) {
            jsonResponse(['success' => false, 'error' => 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.'], 400);
        }

        $name = trim($name);
        $pdo = getDatabaseConnection();
        $statement = $pdo->prepare(
            'INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :password_hash)'
        );

        try {
            $statement->execute([
                'name' => $name,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                jsonResponse(['success' => false, 'error' => 'Este e-mail já está cadastrado.'], 409);
            }
            throw $exception;
        }

        $user = ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'email' => $email];
        session_regenerate_id(true);
        $_SESSION['user'] = $user;

        jsonResponse(['success' => true, 'user' => publicUser($user)], 201);
    }

    if ($action === 'login') {
        $email = $body['email'] ?? null;
        $password = $body['password'] ?? null;

        if (!is_string($email) || !is_string($password)) {
            jsonResponse(['success' => false, 'error' => 'Informe e-mail e senha.'], 400);
        }

        $email = strtolower(trim($email));
        $statement = getDatabaseConnection()->prepare(
            'SELECT id, name, email, password_hash FROM users WHERE email = :email LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            jsonResponse(['success' => false, 'error' => 'E-mail ou senha incorretos.'], 401);
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $update = getDatabaseConnection()->prepare(
                'UPDATE users SET password_hash = :password_hash WHERE id = :id'
            );
            $update->execute([
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'id' => $user['id'],
            ]);
        }

        session_regenerate_id(true);
        $_SESSION['user'] = publicUser($user);
        jsonResponse(['success' => true, 'user' => $_SESSION['user']]);
    }

    if ($action === 'me') {
        if (!isset($_SESSION['user']['id'])) {
            jsonResponse(['success' => true, 'user' => null]);
        }

        $statement = getDatabaseConnection()->prepare(
            'SELECT id, name, email FROM users WHERE id = :id LIMIT 1'
        );
        $statement->execute(['id' => $_SESSION['user']['id']]);
        $user = $statement->fetch();

        if (!$user) {
            unset($_SESSION['user']);
            jsonResponse(['success' => true, 'user' => null]);
        }

        $_SESSION['user'] = publicUser($user);
        jsonResponse(['success' => true, 'user' => $_SESSION['user']]);
    }

    if ($action === 'logout') {
        unset($_SESSION['user']);
        session_regenerate_id(true);
        jsonResponse(['success' => true]);
    }

    jsonResponse(['success' => false, 'error' => 'Ação desconhecida.'], 400);
} catch (PDOException $exception) {
    error_log('Falha na API de autenticação: ' . $exception->getMessage());
    jsonResponse([
        'success' => false,
        'error' => 'Não foi possível acessar o banco. Confira as configurações em config/database.php e importe database/schema.sql.',
    ], 503);
}
