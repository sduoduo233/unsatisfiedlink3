<?php

require_once "common.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Method Not Allowed"]);
    exit;
}

// Validation

if (!isset($_POST["filename"]) || !is_string($_POST["filename"]) || !isset($_POST["admin_password"]) || !is_string($_POST["admin_password"])) {
    http_response_code(400);
    echo json_encode(["error" => "Bad Request"]);
    exit;
}

$filename = $_POST["filename"];

if (!preg_match("/^[a-zA-Z0-9]+$/", $filename)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid filename"]);
    exit;
}

$temp_dir = __DIR__ . "/uploads_tmp/";
$upload_dir = __DIR__ . "/uploads/";

// Query database

$rows = sqlite_query("SELECT * FROM files WHERE filename = ? AND finished_at IS NULL", [$filename]);
if (count($rows) !== 1) {
    http_response_code(404);
    echo json_encode(["error" => "File not found"]);
    exit;
}

if (!password_verify($_POST["admin_password"], $rows[0]["admin_password"])) {
    http_response_code(403);
    echo json_encode(["error" => "Forbidden"]);
    exit;
}

if (!is_file($temp_dir . $filename)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found"]);
    exit;
}

// Mark as finished
sqlite_exec("UPDATE files SET finished_at = datetime() WHERE filename = ?", [$filename]);

// Move file
if (!rename($temp_dir . $filename, $upload_dir . $filename)) {
    http_response_code(500);
    echo json_encode(["error" => "Failed to move file"]);
    exit;
}

echo json_encode(["message" => "OK"]);