<?php

require_once "common.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Method Not Allowed"]);
    exit;
}

// Validation

if (!isset($_POST["filename"]) || !is_string($_POST["filename"]) || !isset($_FILES["file"]) || !isset($_POST["admin_password"]) || !is_string($_POST["admin_password"])) {
    http_response_code(400);
    echo json_encode(["error" => "Bad Request"]);
    exit;
}

$filename = $_POST["filename"];
$file = $_FILES["file"];

if ($file["error"] !== UPLOAD_ERR_OK || empty($file["tmp_name"])) {
    http_response_code(400);
    echo json_encode(["error" => "File upload error " . $file["error"]]);
    exit;
}


if (!preg_match("/^[a-zA-Z0-9]+$/", $filename)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid filename"]);
    exit;
}


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

$target_file = __DIR__ . "/uploads_tmp/" . $filename;

if (!is_file($target_file)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found"]);
    exit;
}

// Append the uploaded part to the target file
file_put_contents($target_file, file_get_contents($file["tmp_name"]), FILE_APPEND | LOCK_EX);

echo json_encode(["message" => "OK"]);