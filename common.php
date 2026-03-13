<?php

error_reporting(E_ALL);


$db = new SQLite3(__DIR__ . "/db.sqlite");


$db->exec("CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    admin_password TEXT NOT NULL,
    finished_at DATETIME,
    uploader_ip TEXT NOT NULL,
    expires_at DATETIME NOT NULL
)");

$db->enableExceptions(true);

if (!is_dir(__DIR__ . "/uploads")) mkdir(__DIR__ . "/uploads", 0755, true);
if (!is_dir(__DIR__ . "/uploads_tmp")) mkdir(__DIR__ . "/uploads_tmp", 0755, true);

function sqlite_query($sql, $params = []) {
    global $db;
    $stmt = $db->prepare($sql);
    for ($i = 0; $i < count($params); $i++) {
        if (!$stmt->bindValue($i + 1, $params[$i])) {
            http_response_code(500);
            echo json_encode(["error" => "Database error"]);
            exit;
        }
    }
    $result = $stmt->execute();
    if (!$result) {
        http_response_code(500);
        echo json_encode(["error" => "Database error"]);
        exit;
    }
    $all = array();
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        array_push($all, $row);
    }
    return $all;
}

function sqlite_exec($sql, $params = []) {
    global $db;
    $stmt = $db->prepare($sql);
    for ($i = 0; $i < count($params); $i++) {
        $stmt->bindValue($i + 1, $params[$i]);
    }
    $result = $stmt->execute();
    if ($result === false) {
        http_response_code(500);
        echo json_encode(["error" => "Database error"]);
        exit;
    }
}

function random_string($length) {
    $chars = "ABCDEFHKLMNPQRSTUVWXYZabcdefhikmnopqrstuvwxyz23456789"; // not ambiguous characters from bitwarden
    $s = "";
    for ($i=0; $i < $length; $i++) { 
        $s = $s . $chars[random_int(0, strlen($chars) - 1)];
    }
    return $s;
}