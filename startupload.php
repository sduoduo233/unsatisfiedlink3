<?php

require_once "common.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Method Not Allowed"]);
    exit;
}

$filename = random_string(8);
$admin_password = random_string(14);

// Insert into database
sqlite_exec("INSERT INTO files (filename, finished_at, uploader_ip, admin_password) VALUES (?, NULL, ?, ?)",[$filename, $_SERVER['REMOTE_ADDR'], password_hash($admin_password, PASSWORD_ARGON2I)]);

$target_file = __DIR__ . "/uploads_tmp/" . $filename;

file_put_contents($target_file, "", LOCK_EX);

echo json_encode(["message" => "OK", "filename" => $filename, "admin_password" => $admin_password]);