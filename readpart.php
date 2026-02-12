<?php

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    echo json_encode(["error" => "Method Not Allowed"]);
    exit;
}

if (!isset($_GET["filename"]) || !is_string($_GET["filename"]) || !isset($_GET["start"]) || !is_string($_GET["start"]) || !isset($_GET["end"]) || !is_string($_GET["end"])) {
    http_response_code(400);
    echo json_encode(["error" => "Bad Request"]);
    exit;
}

$filename = $_GET["filename"];
$start = intval($_GET["start"]);
$end = intval($_GET["end"]);

if ($start < 0 || $end < 0 || $start > $end) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid range"]);
    exit;
}

if (!preg_match("/^[a-zA-Z0-9]+$/", $filename)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid filename"]);
    exit;
}

$path = __DIR__ . "/uploads/" . $filename;

if (!is_file($path)) {
    http_response_code(404);
    echo json_encode(["error" => "File not found"]);
    exit;
}

$filesize = filesize($path);
if ($start >= $filesize) {
    http_response_code(400);
    echo json_encode(["error" => "Start position out of range"]);
    exit;
}
if ($end > $filesize) {
    http_response_code(400);
    echo json_encode(["error" => "End position out of range"]);
    exit;
}

header("Content-Type: application/octet-stream");
header("Content-Length: " . ($end - $start));

$fp = fopen($path, "rb");
fseek($fp, $start);
$n = $start;
while ($n < $end) {
    $chunkSize = min(4096, $end - $n);
    echo fread($fp, $chunkSize);
    flush();
    $n += $chunkSize;
}